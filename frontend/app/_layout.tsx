import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { setAuthToken } from '../services/api';
import { useEffect } from 'react';

function RootLayoutContent() {
  const { token } = useAuth();

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="leads/add" options={{ headerShown: true, title: 'Add Lead' }} />
      <Stack.Screen name="leads/[id]" options={{ headerShown: true, title: 'Lead Details' }} />
      <Stack.Screen name="builders/add" options={{ headerShown: true, title: 'Add Builder' }} />
      <Stack.Screen name="builders/[id]" options={{ headerShown: true, title: 'Builder Details' }} />
      <Stack.Screen name="reminders/add" options={{ headerShown: true, title: 'Add Reminder' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutContent />
    </AuthProvider>
  );
}