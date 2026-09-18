import React, { useEffect } from 'react';
import { Alert, View, StyleSheet, ActivityIndicator, Text, AppState } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { OfflineProvider, useOffline } from '../contexts/OfflineContext';
import { OfflineBanner } from '../components/OfflineBanner';
import { api, setAuthToken } from '../services/api';
import { notificationService } from '../services/notificationService';

function RootLayoutContent() {
  const { token, user, loading, hasFeature, featureFlagsLoading } = useAuth();
  const { isInitialized } = useOffline();
  const pathname = usePathname();
  const handledResponses = React.useRef(new Set<string>());
  const notificationReady = !!token && !loading && isInitialized && pathname !== '/' && pathname !== '/login';
  const deniedPathRef = React.useRef<string | null>(null);

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    if (!notificationReady) return;
    void notificationService.configureReminderActions();
    let active = true;
    let actionPending = false;
    let actionVersion = 0;
    const syncAssignedReminders = async () => {
      const version = actionVersion;
      try {
        const reminders = await api.getReminders({ forceNetwork: true });
        if (!active || actionPending || version !== actionVersion) return;
        await notificationService.syncAssignedReminderNotifications(Array.isArray(reminders) ? reminders : []);
      } catch (error) {
        console.warn('Assigned reminder notification sync skipped:', error);
      }
    };
    const handleResponse = async (response: Parameters<typeof notificationService.handleReminderNotificationResponse>[0]) => {
      const data = response.notification.request.content.data;
      if (!active || data?.type !== 'reminder' || !data.reminderId) return;
      const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
      if (handledResponses.current.has(key)) return;
      handledResponses.current.add(key);
      actionPending = true;
      actionVersion += 1;
      try {
        await notificationService.handleReminderNotificationResponse(response);
      } catch (error) {
        console.error('Failed to process reminder notification action:', error);
        Alert.alert('Reminder Update Failed', 'Please try the action again on this reminder.');
      } finally {
        if (active) router.push({ pathname: '/reminders/edit/[id]', params: { id: String(data.reminderId) } });
        actionPending = false;
        await notificationService.clearLastNotificationResponse();
      }
    };
    const responseSubscription = notificationService.addNotificationResponseReceivedListener(handleResponse);
    void (async () => {
      const response = await notificationService.getLastNotificationResponse();
      if (response) await handleResponse(response);
      if (active && !actionPending) await syncAssignedReminders();
    })().catch(error => console.warn('Notification launch handling failed:', error));
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !actionPending) void syncAssignedReminders();
    });
    return () => {
      active = false;
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [token, notificationReady]);

  useEffect(() => {
    if (loading || token || pathname === '/' || pathname === '/login') return;
    router.replace('/login');
  }, [loading, pathname, token]);

  useEffect(() => {
    if (!token || featureFlagsLoading || pathname === '/' || pathname === '/login') return;

    if (/^\/performance(?:-details)?(?:\/|$)/.test(pathname) && user?.role?.trim().toLowerCase() !== 'admin') {
      if (deniedPathRef.current !== pathname) {
        deniedPathRef.current = pathname;
        Alert.alert('Admin Only', 'Performance Pulse is available to administrators only.');
      }
      router.replace('/dashboard' as any);
      return;
    }

    const routeFeatures: [RegExp, string][] = [
      [/^\/clients(?:\/|$)/, 'buyer_leads'],
      [/^\/inventory(?:\/|$)/, 'seller_inventory'],
      [/^\/builders(?:\/|$)/, 'builders_agents'],
      [/^\/reminders(?:\/|$)/, 'followups'],
      [/^\/workbench(?:\/|$)/, 'daily_workbench'],
      [/^\/(?:legacy-inventory|enquiries)(?:\/|$)/, 'legacy_inventory'],
      [/^\/assigned(?:\/|$)/, 'assigned_leads'],
      [/^\/collaboration(?:\/|$)/, 'team_inbox'],
      [/^\/performance(?:-details)?(?:\/|$)/, 'agent_performance'],
      [/^\/cold-calling(?:\/|$)/, 'cold_calling_inventory'],
      [/^\/site-visit(?:\/|$)/, 'site_visits'],
      [/^\/map(?:\/|$)/, 'lead_map'],
      [/^\/pricing(?:\/|$)/, 'inventory_pricing'],
    ];
    if (
      /^\/leads(?:\/|$)/.test(pathname) &&
      !hasFeature('buyer_leads') &&
      !hasFeature('seller_inventory')
    ) {
      if (deniedPathRef.current !== pathname) {
        deniedPathRef.current = pathname;
        Alert.alert('Access Disabled', 'An administrator has disabled lead and inventory access for your account.');
      }
      router.replace('/dashboard' as any);
      return;
    }
    const match = routeFeatures.find(([pattern]) => pattern.test(pathname));
    if (!match || hasFeature(match[1])) {
      deniedPathRef.current = null;
      return;
    }
    if (deniedPathRef.current !== pathname) {
      deniedPathRef.current = pathname;
      Alert.alert('Access Disabled', 'An administrator has disabled this feature for your account.');
    }
    router.replace('/dashboard' as any);
  }, [featureFlagsLoading, hasFeature, pathname, token, user?.role]);

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
        <Stack.Screen name="workbench" />
        <Stack.Screen name="enquiries" />
        <Stack.Screen name="legacy-inventory" />
        <Stack.Screen name="assigned" />
        <Stack.Screen name="collaboration" />
        <Stack.Screen name="performance" />
        <Stack.Screen name="performance-details" />
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
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
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
