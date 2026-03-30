import React, { useEffect, useState, useCallback } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';
import { notificationService } from '../../services/notificationService';
import { router, useFocusEffect } from 'expo-router';

interface Reminder {
  id: string;
  title: string;
  reminder_date: string;
  reminder_type: string;
  status: string;
  notes: string | null;
  lead_id: number | null;
  lead_name?: string;
  lead_phone?: string;
}

export default function RemindersScreen() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const loadReminders = async () => {
    try {
      const data = await api.getReminders();
      setReminders(data);
    } catch (error) {
      console.error('Failed to load reminders:', error);
    }
  };

  useEffect(() => {
    // Request notification permissions on mount
    notificationService.requestPermissions();
    loadReminders();
  }, []);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadReminders();
    }, [])
  );

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
            await notificationService.cancelReminderNotification(id);
            loadReminders();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete reminder');
          }
        },
      },
    ]);
  };

  const handleMarkComplete = async (id: string) => {
    try {
      await api.updateReminder(id, { status: 'completed' });
      await notificationService.cancelReminderNotification(id);
      loadReminders();
    } catch (error) {
      Alert.alert('Error', 'Failed to update reminder');
    }
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
      case 'Follow Up':
        return 'chatbubbles';
      default:
        return 'notifications';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'completed' ? '#10B981' : '#F59E0B';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    const isPast = date < now;

    let dateLabel = '';
    if (isToday) {
      dateLabel = 'Today';
    } else if (isTomorrow) {
      dateLabel = 'Tomorrow';
    } else {
      dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return { dateLabel, timeStr, isPast, isToday };
  };

  const filteredReminders = reminders.filter(r => {
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'completed') return r.status === 'completed';
    return true;
  });

  // Sort: pending first (by date), then completed
  const sortedReminders = [...filteredReminders].sort((a, b) => {
    if (a.status === 'pending' && b.status === 'completed') return -1;
    if (a.status === 'completed' && b.status === 'pending') return 1;
    return new Date(a.reminder_date).getTime() - new Date(b.reminder_date).getTime();
  });

  const pendingCount = reminders.filter(r => r.status === 'pending').length;
  const completedCount = reminders.filter(r => r.status === 'completed').length;

  const renderReminder = ({ item }: { item: Reminder }) => {
    const { dateLabel, timeStr, isPast, isToday } = formatDate(item.reminder_date);
    const isOverdue = isPast && item.status === 'pending';

    return (
      <TouchableOpacity
        style={[styles.reminderCard, isOverdue && styles.overdueCard]}
        onPress={() => router.push(`/reminders/edit/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.reminderHeader}>
          <View style={[styles.iconContainer, isOverdue && styles.overdueIcon]}>
            <Ionicons 
              name={getReminderIcon(item.reminder_type) as any} 
              size={20} 
              color={isOverdue ? '#EF4444' : '#3B82F6'} 
            />
          </View>
          <View style={styles.reminderContent}>
            <Text style={styles.reminderTitle}>{item.title}</Text>
            <Text style={styles.reminderType}>{item.reminder_type}</Text>
            
            {/* Client info */}
            {item.lead_name && (
              <View style={styles.clientRow}>
                <Ionicons name="person" size={12} color="#6B7280" />
                <Text style={styles.clientText}>{item.lead_name}</Text>
                {item.lead_phone && (
                  <Text style={styles.clientPhone}> • {item.lead_phone}</Text>
                )}
              </View>
            )}
            
            <View style={styles.dateContainer}>
              <Ionicons 
                name="time-outline" 
                size={12} 
                color={isOverdue ? '#EF4444' : '#6B7280'} 
              />
              <Text style={[styles.dateText, isOverdue && styles.overdueText]}>
                {dateLabel} at {timeStr}
              </Text>
              {isOverdue && (
                <View style={styles.overdueBadge}>
                  <Text style={styles.overdueLabel}>OVERDUE</Text>
                </View>
              )}
              {isToday && !isOverdue && item.status === 'pending' && (
                <View style={styles.todayBadge}>
                  <Text style={styles.todayLabel}>TODAY</Text>
                </View>
              )}
            </View>
            
            {item.notes && (
              <Text style={styles.notesText} numberOfLines={2}>{item.notes}</Text>
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
                style={[styles.statusText, { color: getStatusColor(item.status) }]}
              >
                {item.status}
              </Text>
            </View>
            
            {item.status === 'pending' && (
              <TouchableOpacity
                style={styles.completeButton}
                onPress={() => handleMarkComplete(item.id)}
              >
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => handleDelete(item.id, item.title)}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Blue Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.blueHeader}>
          <Text style={styles.headerTitle}>Follow-ups</Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{pendingCount} pending</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({reminders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'pending' && styles.filterTabActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
            Pending ({pendingCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'completed' && styles.filterTabActive]}
          onPress={() => setFilter('completed')}
        >
          <Text style={[styles.filterText, filter === 'completed' && styles.filterTextActive]}>
            Done ({completedCount})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sortedReminders}
        renderItem={renderReminder}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3B82F6']} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="notifications-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No follow-ups found</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first follow-up</Text>
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
  headerSafeArea: {
    backgroundColor: '#3B82F6',
  },
  blueHeader: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterTabActive: {
    backgroundColor: '#3B82F6',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
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
  overdueCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
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
  overdueIcon: {
    backgroundColor: '#FEE2E2',
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
    marginBottom: 6,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  clientText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
    marginLeft: 4,
  },
  clientPhone: {
    fontSize: 12,
    color: '#6B7280',
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: 12,
    color: '#6B7280',
  },
  overdueText: {
    color: '#EF4444',
    fontWeight: '500',
  },
  overdueBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  overdueLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF4444',
  },
  todayBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  todayLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#3B82F6',
  },
  notesText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 6,
    fontStyle: 'italic',
  },
  actions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  completeButton: {
    padding: 2,
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
