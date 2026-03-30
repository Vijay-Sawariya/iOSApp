import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_STORAGE_KEY = 'scheduled_notifications';

// IST offset in milliseconds (5 hours 30 minutes)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

// Configure notification handler - This runs when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export interface ScheduledNotification {
  reminderId: string;
  notificationId: string;
  scheduledTime: string;
}

// Convert IST time to device local time for notification scheduling
const convertISTToLocal = (istDate: Date): Date => {
  // Get current device timezone offset in milliseconds
  const deviceOffsetMs = new Date().getTimezoneOffset() * -60 * 1000;
  
  // Calculate the difference between IST and device timezone
  const diffMs = IST_OFFSET_MS - deviceOffsetMs;
  
  // Adjust the time
  return new Date(istDate.getTime() - diffMs);
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

      // Calculate notification time (10 minutes before) in IST
      const notificationTimeIST = new Date(reminderDateIST.getTime() - 10 * 60 * 1000);
      
      // Convert IST to local device time for scheduling
      const notificationTimeLocal = convertISTToLocal(notificationTimeIST);
      
      // Don't schedule if the notification time is in the past
      if (notificationTimeLocal <= new Date()) {
        console.log('Notification time is in the past, skipping');
        return null;
      }

      // Cancel any existing notification for this reminder
      await notificationService.cancelReminderNotification(reminderId);

      const notificationTitle = leadName 
        ? `🔔 Reminder: ${title}` 
        : `🔔 Reminder: ${title}`;
      
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

      // Store the notification mapping
      await notificationService.storeNotificationMapping(
        reminderId, 
        notificationId, 
        notificationTimeIST.toISOString()
      );

      // Format time for logging
      const timeStr = notificationTimeIST.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });

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
