import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { notificationService } from '../services/notificationService';
import { useAuth } from '../contexts/AuthContext';

export default function Index() {
  const { user, loading } = useAuth();

  const [launchReminderId, setLaunchReminderId] = useState<string | null>(null);
  const [notificationChecked, setNotificationChecked] = useState(false);

  useEffect(() => {
    let active = true;
    notificationService.getLastNotificationResponse().then(response => {
      const data = response?.notification.request.content.data;
      if (active && data?.type === 'reminder' && data.reminderId) {
        setLaunchReminderId(String(data.reminderId));
      }
    }).catch(error => console.warn('Unable to read launch notification:', error))
      .finally(() => { if (active) setNotificationChecked(true); });
    return () => { active = false; };
  }, []);

  if (loading || !notificationChecked) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (user) {
    if (launchReminderId) {
      return <Redirect href={{ pathname: '/reminders/edit/[id]', params: { id: launchReminderId } }} />;
    }
    return <Redirect href="/(tabs)/dashboard" />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
});