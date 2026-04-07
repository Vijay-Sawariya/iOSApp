import React from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { OfflineProvider, useOffline } from '../contexts/OfflineContext';
import { OfflineBanner } from '../components/OfflineBanner';
import { setAuthToken } from '../services/api';
import { useEffect } from 'react';

function RootLayoutContent() {
  const { token } = useAuth();
  const { isInitialized } = useOffline();

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  // Show loading screen while initializing offline database
  if (!isInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Initializing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="leads/add" />
        <Stack.Screen name="leads/[id]" />
        <Stack.Screen name="leads/edit/[id]" />
        <Stack.Screen name="builders/add" />
        <Stack.Screen name="builders/[id]" />
        <Stack.Screen name="builders/edit/[id]" />
        <Stack.Screen name="reminders/add" />
        <Stack.Screen name="reminders/edit/[id]" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
});

export default function RootLayout() {
  return (
    <OfflineProvider>
      <AuthProvider>
        <RootLayoutContent />
      </AuthProvider>
    </OfflineProvider>
  );
}