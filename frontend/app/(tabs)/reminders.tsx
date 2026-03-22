import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { router } from 'expo-router';

interface Reminder {
  id: string;
  title: string;
  reminder_date: string;
  reminder_type: string;
  status: string;
  notes: string | null;
  send_whatsapp: boolean;
}

export default function RemindersScreen() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadReminders = async () => {
    try {
      const data = await api.getReminders();
      setReminders(data);
    } catch (error) {
      console.error('Failed to load reminders:', error);
    }
  };

  useEffect(() => {
    loadReminders();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReminders();
    setRefreshing(false);
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Delete Reminder', `Are you sure you want to delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteReminder(id);
            loadReminders();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete reminder');
          }
        },
      },
    ]);
  };

  const getReminderIcon = (type: string) => {
    switch (type) {
      case 'Call':
        return 'call';
      case 'WhatsApp':
        return 'logo-whatsapp';
      case 'Email':
        return 'mail';
      case 'Meeting':
        return 'people';
      case 'Site Visit':
        return 'location';
      default:
        return 'notifications';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'completed' ? '#10B981' : '#F59E0B';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderReminder = ({ item }: { item: Reminder }) => (
    <View style={styles.reminderCard}>
      <View style={styles.reminderHeader}>
        <View style={styles.iconContainer}>
          <Ionicons name={getReminderIcon(item.reminder_type) as any} size={20} color="#3B82F6" />
        </View>
        <View style={styles.reminderContent}>
          <Text style={styles.reminderTitle}>{item.title}</Text>
          <Text style={styles.reminderType}>{item.reminder_type}</Text>
          <View style={styles.dateContainer}>
            <Ionicons name="time-outline" size={12} color="#6B7280" />
            <Text style={styles.dateText}>{formatDate(item.reminder_date)}</Text>
          </View>
          {item.send_whatsapp && (
            <View style={styles.whatsappBadge}>
              <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
              <Text style={styles.whatsappText}>WhatsApp Enabled</Text>
            </View>
          )}
        </View>
        <View style={styles.actions}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(item.status) + '20' },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(item.status) },
              ]}
            >
              {item.status}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item.id, item.title)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={reminders}
        renderItem={renderReminder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No reminders found</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first reminder</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/reminders/add')}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  listContent: {
    padding: 16,
  },
  reminderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reminderContent: {
    flex: 1,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  reminderType: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
  },
  whatsappBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  whatsappText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#25D366',
  },
  actions: {
    alignItems: 'flex-end',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  deleteButton: {
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});