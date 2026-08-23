import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from './api';

const NOTIFICATION_STORAGE_KEY = 'scheduled_notifications';
const STOPPED_REMINDER_STORAGE_KEY = 'stopped_reminder_notifications';
let stoppedReminderMutation: Promise<void> = Promise.resolve();
export const REMINDER_CATEGORY = 'reminder-actions';
export const REMINDER_SNOOZE_ACTION = 'reminder-snooze-1h';
export const REMINDER_STOP_ACTION = 'reminder-stop';

// IST offset in minutes (5 hours 30 minutes = 330 minutes)
const IST_OFFSET_MINUTES = 330;

// Configure notification handler - This runs when app is in foreground
// CRITICAL: This must be set for notifications to display with sound when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,   // Show the notification banner
    shouldShowList: true,     // Show in notification list
    shouldPlaySound: true,    // Play notification sound
    shouldSetBadge: true,     // Update app badge
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export interface ScheduledNotification {
  reminderId: string;
  notificationId?: string;
  notificationIds?: string[];
  scheduledTime: string;
}

/**
 * Calculate seconds from now until the given IST time
 * This is the most reliable way to schedule notifications
 */
const getSecondsUntilIST = (
  year: number,
  month: number,  // 1-12
  day: number,
  hour: number,   // 0-23 in IST
  minute: number
): number => {
  // Get current time in IST
  const now = new Date();
  const nowUTC = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const nowIST = new Date(nowUTC + (IST_OFFSET_MINUTES * 60 * 1000));
  
  // Create target time in IST (as a simple Date for comparison)
  // We create both dates as if they're in the same timezone for comparison
  const targetIST = new Date(year, month - 1, day, hour, minute, 0);
  
  // Calculate difference in milliseconds
  const nowISTTimestamp = new Date(
    nowIST.getFullYear(),
    nowIST.getMonth(),
    nowIST.getDate(),
    nowIST.getHours(),
    nowIST.getMinutes(),
    nowIST.getSeconds()
  ).getTime();
  
  const targetISTTimestamp = targetIST.getTime();
  
  const diffMs = targetISTTimestamp - nowISTTimestamp;
  const diffSeconds = Math.floor(diffMs / 1000);
  
  console.log(`[Notification] Now IST: ${nowIST.toLocaleString()}`);
  console.log(`[Notification] Target IST: ${targetIST.toLocaleString()}`);
  console.log(`[Notification] Seconds until notification: ${diffSeconds}`);
  
  return diffSeconds;
};

export const notificationService = {
  configureReminderActions: async (): Promise<void> => {
    if (Platform.OS === 'web') return;
    await Notifications.setNotificationCategoryAsync(REMINDER_CATEGORY, [
      {
        identifier: REMINDER_SNOOZE_ACTION,
        buttonTitle: 'Snooze 1 Hour',
        options: { opensAppToForeground: true },
      },
      {
        identifier: REMINDER_STOP_ACTION,
        buttonTitle: 'Stop Reminders',
        options: { isDestructive: true, opensAppToForeground: true },
      },
    ]);
  },

  // Request permission for notifications
  requestPermissions: async (): Promise<boolean> => {
    try {
      // Web doesn't support mobile notifications
      if (Platform.OS === 'web') {
        console.log('Push notifications not supported on web');
        return false;
      }

      if (!Device.isDevice) {
        console.log('Notifications only work on physical devices');
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Failed to get notification permissions');
        Alert.alert(
          'Notifications Disabled',
          'Please enable notifications in your device settings to receive reminders.',
          [{ text: 'OK' }]
        );
        return false;
      }

      // Configure Android channel with high importance for sound and popup
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('reminders', {
          name: 'Follow-up Reminders',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#3B82F6',
          sound: 'default',
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          bypassDnd: true,
        });
      }

      await notificationService.configureReminderActions();

      console.log('Notification permissions granted');
      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  },

  // Schedule a notification 10 minutes before the reminder time (IST)
  // DEPRECATED: Use scheduleReminderNotificationIST instead for better IST handling
  scheduleReminderNotification: async (
    reminderId: string,
    title: string,
    body: string,
    reminderDateIST: Date,
    leadName?: string
  ): Promise<string | null> => {
    try {
      // Web doesn't support push notifications
      if (Platform.OS === 'web') {
        console.log('Notifications not supported on web platform');
        return null;
      }

      if (!Device.isDevice) {
        console.log('Notifications only work on physical devices');
        return null;
      }

      // Calculate notification time (10 minutes before)
      const notificationTime = new Date(reminderDateIST.getTime() - 10 * 60 * 1000);
      
      // Don't schedule if the notification time is in the past
      if (notificationTime <= new Date()) {
        console.log('Notification time is in the past, skipping');
        return null;
      }

      // Cancel any existing notification for this reminder
      await notificationService.cancelReminderNotification(reminderId);

      const notificationTitle = `🔔 Reminder: ${title}`;
      const notificationBody = leadName 
        ? `Follow-up with ${leadName} in 10 minutes`
        : body || 'You have a reminder in 10 minutes';

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationTitle,
          body: notificationBody,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { reminderId, type: 'reminder' },
          categoryIdentifier: REMINDER_CATEGORY,
          vibrate: [0, 250, 250, 250],
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: notificationTime,
          channelId: Platform.OS === 'android' ? 'reminders' : undefined,
        },
      });

      // Store the notification mapping
      await notificationService.storeNotificationMapping(
        reminderId, 
        notificationId, 
        notificationTime.toISOString()
      );

      console.log(`Scheduled notification ${notificationId} for reminder ${reminderId}`);
      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  },

  /**
   * Schedule a notification 10 minutes before the reminder time using IST components
   * This method correctly handles IST timezone without any Date conversion issues
   */
  scheduleReminderNotificationIST: async (
    reminderId: string,
    title: string,
    body: string,
    year: number,
    month: number,  // 1-12
    day: number,
    hour: number,   // 0-23 in IST
    minute: number,
    leadName?: string,
    reactivateStoppedReminder: boolean = true
  ): Promise<string | null> => {
    try {
      // Web doesn't support push notifications
      if (Platform.OS === 'web') {
        console.log('Notifications not supported on web platform');
        return null;
      }

      if (!Device.isDevice) {
        console.log('Notifications only work on physical devices');
        return null;
      }

      // Calls made by reminder add/edit/snooze intentionally reactivate alerts.
      // Background server sync passes false so it cannot undo an explicit stop.
      if (reactivateStoppedReminder) {
        await notificationService.clearStoppedReminder(reminderId);
      }

      const secondsUntilDue = getSecondsUntilIST(year, month, day, hour, minute);
      const firstDelay = secondsUntilDue > 0
        ? secondsUntilDue
        : Math.max(60, 3600 - ((-secondsUntilDue) % 3600));

      // Cancel any existing notification for this reminder
      await notificationService.cancelReminderNotification(reminderId);

      const notificationTitle = `🔔 Reminder: ${title}`;
      const notificationBody = leadName
        ? `Follow-up with ${leadName}. This reminder will repeat every hour until stopped or snoozed.`
        : body || 'This reminder will repeat every hour until stopped or snoozed.';
      const notificationIds: string[] = [];
      // iOS limits pending local notifications. Keep a rolling 24-hour window;
      // editing/snoozing the reminder replaces the entire sequence.
      for (let index = 0; index < 24; index += 1) {
        try {
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: notificationTitle,
              body: notificationBody,
              sound: 'default',
              priority: Notifications.AndroidNotificationPriority.MAX,
              data: {
                reminderId,
                type: 'reminder',
                repeatIndex: index,
                title,
                body,
                leadName: leadName || '',
              },
              categoryIdentifier: REMINDER_CATEGORY,
              vibrate: [0, 250, 250, 250],
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
              seconds: firstDelay + (index * 3600),
              channelId: Platform.OS === 'android' ? 'reminders' : undefined,
            },
          });
          notificationIds.push(notificationId);
        } catch (scheduleError) {
          console.warn(`[Notification] Hourly schedule stopped after ${notificationIds.length} alerts:`, scheduleError);
          break;
        }
      }

      if (notificationIds.length === 0) return null;

      const istTimeStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
      await notificationService.storeNotificationMapping(
        reminderId,
        notificationIds,
        istTimeStr
      );
      console.log(`[Notification] Scheduled ${notificationIds.length} hourly alerts for reminder ${reminderId}`);
      return notificationIds[0] || null;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  },

  // Cancel a scheduled notification for a reminder
  cancelReminderNotification: async (reminderId: string): Promise<void> => {
    try {
      if (Platform.OS === 'web') return;

      const stored = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
      const notifications: ScheduledNotification[] = stored ? JSON.parse(stored) : [];
      const existing = notifications.find(n => n.reminderId === reminderId);
      const ids = new Set(existing?.notificationIds || (existing?.notificationId ? [existing.notificationId] : []));

      // Recover notifications created by older builds or missing from
      // AsyncStorage by inspecting Notification Center's pending requests.
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const notification of scheduled) {
        const data = notification.content.data as Record<string, unknown>;
        if (String(data?.reminderId || '') === String(reminderId)) {
          ids.add(notification.identifier);
        }
      }

      await Promise.all([...ids].map((id) => Notifications.cancelScheduledNotificationAsync(id)));

      // Always remove the mapping, including stale/partial mappings.
      const updated = notifications.filter(n => n.reminderId !== reminderId);
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(updated));
      console.log(`Cancelled ${ids.size} notification(s) for reminder ${reminderId}`);
    } catch (error) {
      console.error('Error cancelling notification:', error);
    }
  },

  // Store notification mapping
  storeNotificationMapping: async (
    reminderId: string,
    notificationId: string | string[],
    scheduledTime: string
  ): Promise<void> => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
      let notifications: ScheduledNotification[] = stored ? JSON.parse(stored) : [];
      
      // Remove any existing entry for this reminder
      notifications = notifications.filter(n => n.reminderId !== reminderId);
      
      // Add new entry
      const notificationIds = Array.isArray(notificationId) ? notificationId : [notificationId];
      notifications.push({ reminderId, notificationId: notificationIds[0], notificationIds, scheduledTime });
      
      await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(notifications));
    } catch (error) {
      console.error('Error storing notification mapping:', error);
    }
  },

  // Get all scheduled notifications
  getScheduledNotifications: async (): Promise<ScheduledNotification[]> => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error getting scheduled notifications:', error);
      return [];
    }
  },

  getStoppedReminderIds: async (): Promise<Set<string>> => {
    try {
      const stored = await AsyncStorage.getItem(STOPPED_REMINDER_STORAGE_KEY);
      const ids: unknown = stored ? JSON.parse(stored) : [];
      return new Set(Array.isArray(ids) ? ids.map(String) : []);
    } catch (error) {
      console.error('Error getting stopped reminders:', error);
      return new Set();
    }
  },

  markReminderStopped: async (reminderId: string): Promise<void> => {
    stoppedReminderMutation = stoppedReminderMutation.catch(() => undefined).then(async () => {
      const ids = await notificationService.getStoppedReminderIds();
      ids.add(String(reminderId));
      await AsyncStorage.setItem(STOPPED_REMINDER_STORAGE_KEY, JSON.stringify([...ids]));
    });
    await stoppedReminderMutation;
  },

  clearStoppedReminder: async (reminderId: string): Promise<void> => {
    stoppedReminderMutation = stoppedReminderMutation.catch(() => undefined).then(async () => {
      const ids = await notificationService.getStoppedReminderIds();
      if (!ids.delete(String(reminderId))) return;
      await AsyncStorage.setItem(STOPPED_REMINDER_STORAGE_KEY, JSON.stringify([...ids]));
    });
    await stoppedReminderMutation;
  },

  syncAssignedReminderNotifications: async (reminders: any[]): Promise<void> => {
    if (Platform.OS === 'web' || !Device.isDevice) return;
    const existing = await notificationService.getScheduledNotifications();
    const stoppedReminderIds = await notificationService.getStoppedReminderIds();
    const existingById = new Map(existing.map((item) => [item.reminderId, item]));
    const serverIds = new Set((reminders || []).map((item) => String(item.id)));

    // Cancel local alerts when another participant completed, dismissed, or
    // deleted the shared reminder.
    for (const item of existing) {
      const reminder = (reminders || []).find((row) => String(row.id) === item.reminderId);
      const status = String(reminder?.status || '').toLowerCase();
      if (!serverIds.has(item.reminderId) || !['pending', 'up coming', 'snoozed'].includes(status)) {
        await notificationService.cancelReminderNotification(item.reminderId);
      }
    }

    for (const reminder of reminders || []) {
      const reminderId = String(reminder.id);
      if (stoppedReminderIds.has(reminderId)) {
        await notificationService.cancelReminderNotification(reminderId);
        continue;
      }
      const status = String(reminder.status || '').toLowerCase();
      if (!['pending', 'up coming', 'snoozed'].includes(status)) continue;
      const value = String(reminder.reminder_date || '').replace(' ', 'T');
      const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (!match) continue;
      const existingReminder = existingById.get(String(reminder.id));
      const targetMinute = value.slice(0, 16);
      const existingMinute = String(existingReminder?.scheduledTime || '').replace(' ', 'T').slice(0, 16);
      if (existingReminder && existingMinute === targetMinute) continue;
      if (existingReminder) await notificationService.cancelReminderNotification(String(reminder.id));
      await notificationService.scheduleReminderNotificationIST(
        reminderId,
        reminder.title,
        reminder.notes || reminder.reminder_type || 'Follow-up reminder',
        Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]),
        reminder.lead_name,
        false
      );
    }
  },

  handleReminderNotificationResponse: async (
    response: Notifications.NotificationResponse
  ): Promise<'snoozed' | 'stopped' | 'opened' | null> => {
    const data = response.notification.request.content.data as Record<string, any>;
    if (data?.type !== 'reminder' || !data?.reminderId) return null;
    const reminderId = String(data.reminderId);

    if (response.actionIdentifier === REMINDER_STOP_ACTION) {
      // Persist the user's choice before cancelling. AppState can trigger a
      // server sync while this action is being handled; the tombstone prevents
      // that concurrent sync from recreating the hourly notification sequence.
      await notificationService.markReminderStopped(reminderId);
      await notificationService.cancelReminderNotification(reminderId);
      await api.updateReminder(reminderId, { status: 'Dismissed' });
      return 'stopped';
    }

    if (response.actionIdentifier === REMINDER_SNOOZE_ACTION) {
      await notificationService.clearStoppedReminder(reminderId);
      const snoozed = new Date(Date.now() + 60 * 60 * 1000);
      const date = `${snoozed.getFullYear()}-${String(snoozed.getMonth() + 1).padStart(2, '0')}-${String(snoozed.getDate()).padStart(2, '0')}`;
      const time = `${String(snoozed.getHours()).padStart(2, '0')}:${String(snoozed.getMinutes()).padStart(2, '0')}:00`;
      await api.updateReminder(reminderId, { reminder_date: `${date}T${time}`, status: 'Pending' });
      await notificationService.scheduleReminderNotificationIST(
        reminderId,
        String(data.title || 'Follow-up'),
        String(data.body || 'Follow-up reminder'),
        snoozed.getFullYear(), snoozed.getMonth() + 1, snoozed.getDate(), snoozed.getHours(), snoozed.getMinutes(),
        String(data.leadName || '') || undefined
      );
      return 'snoozed';
    }

    return 'opened';
  },

  // Cancel all scheduled notifications
  cancelAllNotifications: async (): Promise<void> => {
    try {
      if (Platform.OS === 'web') return;
      
      await Notifications.cancelAllScheduledNotificationsAsync();
      await AsyncStorage.removeItem(NOTIFICATION_STORAGE_KEY);
      console.log('Cancelled all notifications');
    } catch (error) {
      console.error('Error cancelling all notifications:', error);
    }
  },

  // Add notification listeners
  addNotificationReceivedListener: (callback: (notification: Notifications.Notification) => void) => {
    return Notifications.addNotificationReceivedListener(callback);
  },

  addNotificationResponseReceivedListener: (callback: (response: Notifications.NotificationResponse) => void) => {
    return Notifications.addNotificationResponseReceivedListener(callback);
  },

  // Get push token (for future server-side notifications)
  getExpoPushToken: async (): Promise<string | null> => {
    try {
      if (Platform.OS === 'web' || !Device.isDevice) {
        return null;
      }

      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: 'a0d442af-30a8-4e41-8033-d84dc2d3dbb8',
      });
      
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  },

  // Test notification (for debugging)
  sendTestNotification: async (): Promise<void> => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Info', 'Notifications only work on mobile devices');
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '🔔 Test Notification',
          body: 'This is a test notification from Sagar Home',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 2,
          channelId: Platform.OS === 'android' ? 'reminders' : undefined,
        },
      });

      Alert.alert('Success', 'Test notification will appear in 2 seconds');
    } catch (error) {
      console.error('Error sending test notification:', error);
      Alert.alert('Error', 'Failed to send test notification');
    }
  },
};
