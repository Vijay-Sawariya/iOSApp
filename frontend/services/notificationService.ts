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
 * Get the current device timezone offset from IST in minutes
 * This is used to correctly schedule notifications at the right local time
 */
const getDeviceOffsetFromIST = (): number => {
  // Device's UTC offset in minutes (negative for UTC+)
  const deviceOffsetMinutes = new Date().getTimezoneOffset() * -1;
  // IST is UTC+330 minutes
  // Difference = IST - Device
  return IST_OFFSET_MINUTES - deviceOffsetMinutes;
};

/**
 * Convert IST date/time components to a local Date for notification scheduling
 * @param year - Year in IST
 * @param month - Month (1-12) in IST
 * @param day - Day in IST
 * @param hour - Hour (0-23) in IST
 * @param minute - Minute in IST
 * @returns Date object in local device time
 */
const istToLocalDate = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date => {
  // Create a date assuming IST values
  // First, create the date as if it's local time
  const localDate = new Date(year, month - 1, day, hour, minute, 0);
  
  // Calculate the offset between IST and device timezone
  const offsetMinutes = getDeviceOffsetFromIST();
  
  // Adjust the time by subtracting the offset
  // If device is behind IST (e.g., UTC), we subtract the difference
  // If device is ahead of IST (e.g., UTC+8), we add the difference
  const adjustedTime = new Date(localDate.getTime() - offsetMinutes * 60 * 1000);
  
  return adjustedTime;
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

      // Convert IST notification time to local device time
      const notificationTimeLocal = istToLocalDate(notifYear, notifMonth, notifDay, notifHour, notifMinute);

      // Don't schedule if the notification time is in the past
      if (notificationTimeLocal <= new Date()) {
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
          date: notificationTimeLocal,
          channelId: Platform.OS === 'android' ? 'reminders' : undefined,
        },
      });

      // Format IST time for logging
      const hour12 = notifHour % 12 || 12;
      const ampm = notifHour < 12 ? 'AM' : 'PM';
      const timeStr = `${hour12}:${notifMinute.toString().padStart(2, '0')} ${ampm}`;

      // Store the notification mapping with IST time
      const istTimeStr = `${notifYear}-${notifMonth.toString().padStart(2, '0')}-${notifDay.toString().padStart(2, '0')}T${notifHour.toString().padStart(2, '0')}:${notifMinute.toString().padStart(2, '0')}:00`;
      await notificationService.storeNotificationMapping(
        reminderId, 
        notificationId, 
        istTimeStr
      );

      console.log(`Scheduled notification ${notificationId} for reminder ${reminderId} at ${timeStr} IST`);
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
