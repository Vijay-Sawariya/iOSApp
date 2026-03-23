import React, { createContext, useState, useContext, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await storage.getItem('token');
      const storedUser = await storage.getItem('user');

      if (storedToken && storedUser) {
        const user = JSON.parse(storedUser);
        // Check if user ID is a number (MySQL) or string (MongoDB ObjectID)
        // Clear old MongoDB auth data
        if (typeof user.id === 'string' && user.id.length === 24) {
          console.log('Clearing old MongoDB auth data');
          await storage.deleteItem('token');
          await storage.deleteItem('user');
        } else {
          setToken(storedToken);
          setUser(user);
        }
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
      // Clear corrupted data
      await storage.deleteItem('token');
      await storage.deleteItem('user');
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.access_token);
        setUser(data.user);
        await storage.setItem('token', data.access_token);
        await storage.setItem('user', JSON.stringify(data.user));
        return true;
      } else {
        Alert.alert('Login Failed', data.detail || 'Invalid credentials');
        return false;
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to server');
      console.error('Login error:', error);
      return false;
    }
  };

  const register = async (
    username: string,
    password: string,
    fullName: string,
    email: string
  ): Promise<boolean> => {
    try {
      const registerResponse = await fetch(`${API_URL}/api/auth/register`, {
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
      Alert.alert('Error', 'Failed to connect to server');
      console.error('Register error:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      setUser(null);
      setToken(null);
      await storage.deleteItem('token');
      await storage.deleteItem('user');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
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