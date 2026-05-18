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
import { useAuth } from '../../contexts/AuthContext';
import { canViewSensitiveData, maskPhone } from '../../constants/leadOptions';
import { colors, radii, shadows } from '../../constants/theme';

interface Reminder {
  id: number;
  title: string;
  reminder_date: string;
  reminder_type: string;
  status: string;
  notes: string | null;
  lead_id: number | null;
  lead_name?: string;
  lead_phone?: string;
  lead_created_by?: number | null;
}

// India timezone offset (UTC+5:30)
const formatDateIST = (dateString: string) => {
  const date = new Date(dateString);
  // Format for IST display
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  };
  return date.toLocaleString('en-IN', options);
};

const getDateInfo = (dateString: string) => {
  // Parse the date - the server sends it in format YYYY-MM-DDTHH:MM:SS (IST)
  // We parse it as local date components (since the string already represents IST)
  let year: number, month: number, day: number, hours: number, minutes: number, seconds: number;
  
  if (dateString.includes('T')) {
    // Parse ISO format - these values ARE IST values
    const [datePart, timePart] = dateString.split('T');
    [year, month, day] = datePart.split('-').map(Number);
    const timeParts = timePart.split(':').map(Number);
    hours = timeParts[0];
    minutes = timeParts[1];
    seconds = timeParts[2] || 0;
  } else if (dateString.includes(' ')) {
    const [datePart, timePart] = dateString.split(' ');
    [year, month, day] = datePart.split('-').map(Number);
    const timeParts = timePart.split(':').map(Number);
    hours = timeParts[0];
    minutes = timeParts[1];
    seconds = timeParts[2] || 0;
  } else {
    const date = new Date(dateString);
    year = date.getFullYear();
    month = date.getMonth() + 1;
    day = date.getDate();
    hours = date.getHours();
    minutes = date.getMinutes();
    seconds = 0;
  }
  
  // Get current time in IST
  // IST is UTC+5:30
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const istTime = new Date(utcTime + (5.5 * 60 * 60000));
  
  // Create comparable values
  const reminderTimestamp = new Date(year, month - 1, day, hours, minutes, seconds).getTime();
  
  // Get IST date components for comparison
  const nowYear = istTime.getFullYear();
  const nowMonth = istTime.getMonth();
  const nowDay = istTime.getDate();
  const nowHours = istTime.getHours();
  const nowMinutes = istTime.getMinutes();
  
  // Create timestamps for comparison (treating IST as local)
  const nowTimestampIST = new Date(nowYear, nowMonth, nowDay, nowHours, nowMinutes, 0).getTime();
  
  // Today/Tomorrow comparison (in IST)
  const todayStartIST = new Date(nowYear, nowMonth, nowDay, 0, 0, 0).getTime();
  const reminderDayStartIST = new Date(year, month - 1, day, 0, 0, 0).getTime();
  const tomorrowStartIST = todayStartIST + 24 * 60 * 60 * 1000;
  
  const isToday = reminderDayStartIST === todayStartIST;
  const isTomorrow = reminderDayStartIST === tomorrowStartIST;
  
  // Check if overdue - compare full timestamps
  const isPast = reminderTimestamp < nowTimestampIST;

  let dateLabel = '';
  if (isToday) {
    dateLabel = 'Today';
  } else if (isTomorrow) {
    dateLabel = 'Tomorrow';
  } else {
    const displayDate = new Date(year, month - 1, day);
    dateLabel = displayDate.toLocaleDateString('en-IN', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  }

  // Format time in 12-hour format (IST)
  let hour12 = hours % 12;
  hour12 = hour12 ? hour12 : 12;
  const ampm = hours >= 12 ? 'pm' : 'am';
  const timeStr = `${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  
  return { dateLabel, timeStr, isPast, isToday };
};

export default function RemindersScreen() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');

  const loadReminders = async () => {
    try {
      const data = await api.getReminders();
      setReminders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load reminders:', error);
    }
  };

  useEffect(() => {
    notificationService.requestPermissions();
    loadReminders();
  }, []);

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

  const handleDelete = (id: number, title: string) => {
    Alert.alert('Delete Follow-up', `Are you sure you want to delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteReminder(id.toString());
            await notificationService.cancelReminderNotification(id.toString());
            loadReminders();
          } catch (error) {
            console.error('Delete error:', error);
            Alert.alert('Error', 'Failed to delete follow-up');
          }
        },
      },
    ]);
  };

  const handleMarkComplete = async (id: number) => {
    try {
      await api.updateReminder(id.toString(), { status: 'completed' });
      await notificationService.cancelReminderNotification(id.toString());
      loadReminders();
    } catch (error) {
      Alert.alert('Error', 'Failed to update follow-up');
    }
  };

  const getReminderIcon = (type: string) => {
    switch (type) {
      case 'Call': return 'call';
      case 'WhatsApp': return 'logo-whatsapp';
      case 'Email': return 'mail';
      case 'Meeting': return 'people';
      case 'Site Visit': return 'location';
      case 'Follow Up': return 'chatbubbles';
      default: return 'notifications';
    }
  };

  const getStatusColor = (status: string) => {
    const statusLower = status?.toLowerCase() || '';
    return statusLower === 'completed' ? '#10B981' : '#F59E0B';
  };

  const filteredReminders = reminders.filter(r => {
    const statusLower = (r.status || '').toLowerCase();
    if (filter === 'pending') return statusLower === 'pending' || statusLower === 'up coming';
    if (filter === 'completed') return statusLower === 'completed';
    return true;
  });

  const sortedReminders = [...filteredReminders].sort((a, b) => {
    const aStatusLower = (a.status || '').toLowerCase();
    const bStatusLower = (b.status || '').toLowerCase();
    if (aStatusLower === 'pending' && bStatusLower === 'completed') return -1;
    if (aStatusLower === 'completed' && bStatusLower === 'pending') return 1;
    return new Date(a.reminder_date).getTime() - new Date(b.reminder_date).getTime();
  });

  const pendingCount = reminders.filter(r => (r.status || '').toLowerCase() === 'pending').length;
  const completedCount = reminders.filter(r => (r.status || '').toLowerCase() === 'completed').length;

  const renderReminder = ({ item }: { item: Reminder }) => {
    const { dateLabel, timeStr, isPast, isToday } = getDateInfo(item.reminder_date);
    const statusLower = (item.status || '').toLowerCase();
    const isOverdue = isPast && statusLower === 'pending';

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
            
            {item.lead_name && (
              <View style={styles.clientRow}>
                <Ionicons name="person" size={12} color="#6B7280" />
                <Text style={styles.clientText}>{item.lead_name}</Text>
                {item.lead_phone && (
                  <Text style={styles.clientPhone}>
                    {' • '}
                    {canViewSensitiveData(user?.role, user?.id, item.lead_created_by)
                      ? item.lead_phone
                      : maskPhone(item.lead_phone)}
                  </Text>
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
              {isToday && !isOverdue && statusLower === 'pending' && (
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
            
            {statusLower === 'pending' && (
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
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/reminders/add')}>
              <Ionicons name="add" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      <View style={styles.contentArea}>
        {/* Stats Bar */}
        <View style={styles.statsBar}>
          <TouchableOpacity
            style={[styles.statItem, filter === 'all' && styles.statItemActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.statNumber, filter === 'all' && styles.statNumberActive]}>{reminders.length}</Text>
            <Text style={[styles.statLabel, filter === 'all' && styles.statLabelActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statItem, filter === 'pending' && styles.statItemActive]}
            onPress={() => setFilter('pending')}
          >
            <Text style={[styles.statNumber, filter === 'pending' && styles.statNumberActive]}>{pendingCount}</Text>
            <Text style={[styles.statLabel, filter === 'pending' && styles.statLabelActive]}>Pending</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statItem, filter === 'completed' && styles.statItemActive]}
            onPress={() => setFilter('completed')}
          >
            <Text style={[styles.statNumber, filter === 'completed' && styles.statNumberActive]}>{completedCount}</Text>
            <Text style={[styles.statLabel, filter === 'completed' && styles.statLabelActive]}>Done</Text>
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
      </View>

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/reminders/add')}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  headerSafeArea: {
    backgroundColor: colors.primary,
  },
  blueHeader: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.white,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radii.md,
    marginHorizontal: 4,
  },
  statItemActive: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  statNumberActive: {
    color: colors.primary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 2,
  },
  statLabelActive: {
    color: colors.primary,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  reminderCard: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  overdueCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
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
    color: colors.ink,
    marginBottom: 4,
  },
  reminderType: {
    fontSize: 14,
    color: colors.inkMuted,
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
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.floating,
  },
});
