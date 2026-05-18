import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken, initializeAuthToken } from '../services/api';


const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
const REQUEST_TIMEOUT_MS = 15000;

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs: number = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

// Inactivity timeout: 2 days in milliseconds
const INACTIVITY_TIMEOUT_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

// Unified storage using AsyncStorage (works on web and native)
const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('Storage getItem error:', error);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('Storage setItem error:', error);
    }
  },
  async deleteItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Storage deleteItem error:', error);
    }
  }
};

interface User {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, fullName: string, email: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateLastActivity: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(true);
  const appState = useRef(AppState.currentState);

  // Update last activity timestamp
  const updateLastActivity = async () => {
    try {
      const now = Date.now().toString();
      await storage.setItem('lastActivity', now);
    } catch (error) {
      console.error('Failed to update last activity:', error);
    }
  };

  // Check if user has been inactive for more than 2 days
  const checkInactivity = async (): Promise<boolean> => {
    try {
      const lastActivityStr = await storage.getItem('lastActivity');
      if (!lastActivityStr) {
        // No last activity recorded, user is active now
        await updateLastActivity();
        return false;
      }
      
      const lastActivity = parseInt(lastActivityStr, 10);
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      
      if (timeSinceLastActivity > INACTIVITY_TIMEOUT_MS) {
        console.log('User inactive for more than 2 days, logging out...');
        return true; // User is inactive
      }
      
      return false;
    } catch (error) {
      console.error('Failed to check inactivity:', error);
      return false;
    }
  };

  // Handle app state changes (foreground/background)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [user, token]);

  const handleAppStateChange = async (nextAppState: AppStateStatus) => {
    // When app comes to foreground from background
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // Check if user should be logged out due to inactivity
      if (user && token) {
        const isInactive = await checkInactivity();
        if (isInactive) {
          Alert.alert(
            'Session Expired',
            'You have been logged out due to inactivity. Please login again.',
            [{ text: 'OK' }]
          );
          await performLogout();
        } else {
          // User is active, update last activity
          await updateLastActivity();
        }
      }
    }
    
    // When app goes to background, save last activity
    if (nextAppState.match(/inactive|background/) && user && token) {
      await updateLastActivity();
    }
    
    appState.current = nextAppState;
  };

  useEffect(() => {
    // Initialize API token first, then load stored auth
    const bootstrapAuth = async () => {
      try {
        await initializeAuthToken();
        await loadStoredAuth();
      } finally {
        setIsInitializing(false);
      }
    };

    bootstrapAuth();

    // Failsafe: prevent login screen from being stuck disabled forever
    const initTimeout = setTimeout(() => {
      setIsInitializing(false);
      setLoading(false);
    }, 8000);

    return () => clearTimeout(initTimeout);
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await storage.getItem('token');
      const storedUser = await storage.getItem('user');

      if (storedToken && storedUser) {
        // Check for inactivity timeout FIRST
        const isInactive = await checkInactivity();
        if (isInactive) {
          console.log('User inactive for more than 2 days on app load, logging out...');
          await storage.deleteItem('token');
          await storage.deleteItem('user');
          await storage.deleteItem('lastActivity');
          setAuthToken(null);
          // Show alert after a short delay so the UI is ready
          setTimeout(() => {
            Alert.alert(
              'Session Expired',
              'You have been logged out due to inactivity. Please login again.',
              [{ text: 'OK' }]
            );
          }, 500);
          return;
        }

        const user = JSON.parse(storedUser);
        // Check if user ID is a number (MySQL) or string (MongoDB ObjectID)
        // Clear old MongoDB auth data
        if (typeof user.id === 'string' && user.id.length === 24) {
          console.log('Clearing old MongoDB auth data');
          await storage.deleteItem('token');
          await storage.deleteItem('user');
          setAuthToken(null);
        } else {
          setToken(storedToken);
          setUser(user);
          setAuthToken(storedToken);  // Set token for API calls
          void api.preloadCoreData();
          // Update last activity since user is active
          await updateLastActivity();
        }
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
      // Clear corrupted data
      await storage.deleteItem('token');
      await storage.deleteItem('user');
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  };

  // Helper function to perform logout and clear all data
  const performLogout = async () => {
    try {
      setUser(null);
      setToken(null);
      setAuthToken(null);
      await storage.deleteItem('token');
      await storage.deleteItem('user');
      await storage.deleteItem('lastActivity');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    if (!API_URL) {
      Alert.alert(
        'Configuration Error',
        'Server URL is missing. Please reinstall/update the app or contact support.'
      );
      return false;
    }

    setLoading(true);

    try {
      const response = await fetchWithTimeout(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (response.ok && data?.access_token && data?.user) {
        setToken(data.access_token);
        setUser(data.user);
        setAuthToken(data.access_token);  // Set token for API calls
        await storage.setItem('token', data.access_token);
        await storage.setItem('user', JSON.stringify(data.user));
        void api.preloadCoreData();
        // Set last activity on successful login
        await updateLastActivity();
        return true;
      } else if (response.ok) {
        Alert.alert('Login Failed', 'Unexpected server response. Please try again.');
        return false;
      } else {
        Alert.alert('Login Failed', data?.detail || 'Invalid credentials');
        return false;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        Alert.alert('Login Timeout', 'The server took too long to respond. Please check your connection and try again.');
      } else {
        Alert.alert('Error', 'Failed to connect to server');
      }
      console.error('Login error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const register = async (
    username: string,
    password: string,
    fullName: string,
    email: string
  ): Promise<boolean> => {
    if (!API_URL) {
      Alert.alert(
        'Configuration Error',
        'Server URL is missing. Please reinstall/update the app or contact support.'
      );
      return false;
    }

    try {
      const registerResponse = await fetchWithTimeout(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          full_name: fullName,
          email,
          role: 'user',
        }),
      });

      if (registerResponse.ok) {
        return await login(username, password);
      } else {
        const data = await registerResponse.json();
        Alert.alert('Registration Failed', data.detail || 'Could not create account');
        return false;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        Alert.alert('Registration Timeout', 'The server took too long to respond. Please check your connection and try again.');
      } else {
        Alert.alert('Error', 'Failed to connect to server');
      }
      console.error('Register error:', error);
      return false;
    }
  };

  const logout = async () => {
    await performLogout();
    router.replace('/login');
  };

  const combinedLoading = loading || isInitializing;

  return (
    <AuthContext.Provider value={{ user, token, loading: combinedLoading, login, register, logout, updateLastActivity }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
