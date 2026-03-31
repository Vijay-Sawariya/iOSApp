import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_STORAGE_KEY = 'scheduled_notifications';

// IST offset in minutes (5 hours 30 minutes = 330 minutes)
const IST_OFFSET_MINUTES = 330;

// Configure notification handler - This runs when app is in foreground
// CRITICAL: This must be set for notifications to display with sound when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,    // Show the notification popup
    shouldPlaySound: true,    // Play notification sound
    shouldSetBadge: true,     // Update app badge
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export interface ScheduledNotification {
  reminderId: string;
  notificationId: string;
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
          vibrate: [0, 250, 250, 250],
        },
        trigger: {
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

      // Calculate notification time (10 minutes before the reminder) in IST
      let notifMinute = minute - 10;
      let notifHour = hour;
      let notifDay = day;
      let notifMonth = month;
      let notifYear = year;

      if (notifMinute < 0) {
        notifMinute += 60;
        notifHour -= 1;
      }

      if (notifHour < 0) {
        notifHour += 24;
        notifDay -= 1;
      }

      // Handle month/year rollback (simplified - for edge cases)
      if (notifDay < 1) {
        notifMonth -= 1;
        if (notifMonth < 1) {
          notifMonth = 12;
          notifYear -= 1;
        }
        // Get last day of previous month
        const lastDay = new Date(notifYear, notifMonth, 0).getDate();
        notifDay = lastDay;
      }

      // Calculate seconds from now until the notification time
      const secondsUntil = getSecondsUntilIST(notifYear, notifMonth, notifDay, notifHour, notifMinute);

      // Don't schedule if the notification time is in the past
      if (secondsUntil <= 0) {
        console.log(`[Notification] Time is in the past (${secondsUntil}s), skipping`);
        return null;
      }

      // Cancel any existing notification for this reminder
      await notificationService.cancelReminderNotification(reminderId);

      const notificationTitle = `🔔 Reminder: ${title}`;
      const notificationBody = leadName 
        ? `Follow-up with ${leadName} in 10 minutes`
        : body || 'You have a reminder in 10 minutes';

      // Format IST time for logging
      const hour12 = notifHour % 12 || 12;
      const ampm = notifHour < 12 ? 'AM' : 'PM';
      const timeStr = `${hour12}:${notifMinute.toString().padStart(2, '0')} ${ampm}`;

      console.log(`[Notification] Scheduling for ${timeStr} IST (in ${secondsUntil} seconds)`);

      // Use seconds trigger - this is more reliable than date trigger
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationTitle,
          body: notificationBody,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { reminderId, type: 'reminder' },
          vibrate: [0, 250, 250, 250],
        },
        trigger: {
          seconds: secondsUntil,
          channelId: Platform.OS === 'android' ? 'reminders' : undefined,
        },
      });

      // Store the notification mapping with IST time
      const istTimeStr = `${notifYear}-${notifMonth.toString().padStart(2, '0')}-${notifDay.toString().padStart(2, '0')}T${notifHour.toString().padStart(2, '0')}:${notifMinute.toString().padStart(2, '0')}:00`;
      await notificationService.storeNotificationMapping(
        reminderId, 
        notificationId, 
        istTimeStr
      );

      console.log(`[Notification] Scheduled ${notificationId} for reminder ${reminderId} at ${timeStr} IST (in ${Math.round(secondsUntil/60)} mins)`);
      return notificationId;
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
      if (stored) {
        const notifications: ScheduledNotification[] = JSON.parse(stored);
        const existing = notifications.find(n => n.reminderId === reminderId);
        
        if (existing) {
          await Notifications.cancelScheduledNotificationAsync(existing.notificationId);
          
          // Remove from storage
          const updated = notifications.filter(n => n.reminderId !== reminderId);
          await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(updated));
          
          console.log(`Cancelled notification for reminder ${reminderId}`);
        }
      }
    } catch (error) {
      console.error('Error cancelling notification:', error);
    }
  },

  // Store notification mapping
  storeNotificationMapping: async (
    reminderId: string,
    notificationId: string,
    scheduledTime: string
  ): Promise<void> => {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
      let notifications: ScheduledNotification[] = stored ? JSON.parse(stored) : [];
      
      // Remove any existing entry for this reminder
      notifications = notifications.filter(n => n.reminderId !== reminderId);
      
      // Add new entry
      notifications.push({ reminderId, notificationId, scheduledTime });
      
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
        projectId: 'your-project-id',
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
