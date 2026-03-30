import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATION_STORAGE_KEY = 'scheduled_notifications';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface ScheduledNotification {
  reminderId: string;
  notificationId: string;
  scheduledTime: string;
}

export const notificationService = {
  // Request permission for notifications
  requestPermissions: async (): Promise<boolean> => {
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
      return false;
    }

    // Configure Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
        sound: 'default',
      });
    }

    return true;
  },

  // Schedule a notification 10 minutes before the reminder time
  scheduleReminderNotification: async (
    reminderId: string,
    title: string,
    body: string,
    reminderDate: Date,
    leadName?: string
  ): Promise<string | null> => {
    try {
      // Check if we're on web - notifications not supported
      if (Platform.OS === 'web') {
        console.log('Notifications not supported on web platform');
        return null;
      }

      // Calculate notification time (10 minutes before)
      const notificationTime = new Date(reminderDate.getTime() - 10 * 60 * 1000);
      
      // Don't schedule if the notification time is in the past
      if (notificationTime <= new Date()) {
        console.log('Notification time is in the past, skipping');
        return null;
      }

      // Cancel any existing notification for this reminder
      await notificationService.cancelReminderNotification(reminderId);

      const notificationTitle = leadName 
        ? `Reminder: ${title} - ${leadName}` 
        : `Reminder: ${title}`;

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notificationTitle,
          body: body || 'You have a reminder in 10 minutes',
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { reminderId, type: 'reminder' },
        },
        trigger: {
          date: notificationTime,
        },
      });

      // Store the notification mapping
      await notificationService.storeNotificationMapping(reminderId, notificationId, notificationTime.toISOString());

      console.log(`Scheduled notification ${notificationId} for reminder ${reminderId} at ${notificationTime}`);
      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  },

  // Cancel a scheduled notification for a reminder
  cancelReminderNotification: async (reminderId: string): Promise<void> => {
    try {
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
      if (!Device.isDevice) {
        return null;
      }

      const { data: token } = await Notifications.getExpoPushTokenAsync({
        projectId: 'your-project-id', // Replace with actual project ID if needed
      });
      
      return token;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  },
};
