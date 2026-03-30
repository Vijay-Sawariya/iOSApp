import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../../services/api';
import { notificationService } from '../../../services/notificationService';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Lead {
  id: number;
  name: string;
  phone: string | null;
  lead_type: string | null;
}

const REMINDER_TYPES = [
  { value: 'Call', icon: 'call', color: '#3B82F6' },
  { value: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
  { value: 'Email', icon: 'mail', color: '#EF4444' },
  { value: 'Meeting', icon: 'people', color: '#8B5CF6' },
  { value: 'Site Visit', icon: 'location', color: '#F59E0B' },
  { value: 'Follow Up', icon: 'chatbubbles', color: '#10B981' },
];

export default function EditReminderScreen() {
  const { id } = useLocalSearchParams();
  const reminderId = id as string;

  const [title, setTitle] = useState('');
  const [reminderDate, setReminderDate] = useState(new Date());
  const [reminderType, setReminderType] = useState('Call');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('pending');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [reminderId]);

  const loadData = async () => {
    try {
      // Load reminder and leads in parallel
      const [reminders, clients, inventory] = await Promise.all([
        api.getReminders(),
        api.getClientLeads(),
        api.getInventoryLeads(),
      ]);

      const allLeads = [...clients, ...inventory].map(l => ({
        id: l.id,
        name: l.name,
        phone: l.phone,
        lead_type: l.lead_type,
      }));
      setLeads(allLeads);

      // Find the specific reminder
      const reminder = reminders.find((r: any) => r.id.toString() === reminderId);
      if (reminder) {
        setTitle(reminder.title);
        setReminderDate(new Date(reminder.reminder_date));
        setReminderType(reminder.reminder_type);
        setNotes(reminder.notes || '');
        setStatus(reminder.status);

        if (reminder.lead_id) {
          const lead = allLeads.find(l => l.id === reminder.lead_id);
          if (lead) {
            setSelectedLead(lead);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      Alert.alert('Error', 'Failed to load reminder data');
    } finally {
      setInitialLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    setLoading(true);
    try {
      const reminderData = {
        title,
        reminder_date: reminderDate.toISOString(),
        reminder_type: reminderType,
        notes: notes || null,
        lead_id: selectedLead?.id || null,
        status,
      };

      await api.updateReminder(reminderId, reminderData);

      // Reschedule notification if status is pending
      if (status === 'pending') {
        await notificationService.scheduleReminderNotification(
          reminderId,
          title,
          `${reminderType} reminder${selectedLead ? ` for ${selectedLead.name}` : ''}`,
          reminderDate,
          selectedLead?.name
        );
      } else {
        // Cancel notification if completed
        await notificationService.cancelReminderNotification(reminderId);
      }

      Alert.alert('Success', 'Follow-up updated successfully!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to update follow-up');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Follow-up', 'Are you sure you want to delete this follow-up?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteReminder(reminderId);
            await notificationService.cancelReminderNotification(reminderId);
            router.back();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete follow-up');
          }
        },
      },
    ]);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(reminderDate);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      setReminderDate(newDate);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(reminderDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setReminderDate(newDate);
    }
  };

  const filteredLeads = leads.filter(l =>
    l.name.toLowerCase().includes(leadSearch.toLowerCase()) ||
    (l.phone && l.phone.includes(leadSearch))
  );

  const getLeadTypeLabel = (type: string | null) => {
    switch (type) {
      case 'buyer': return 'Buyer';
      case 'tenant': return 'Tenant';
      case 'seller': return 'Seller';
      case 'landlord': return 'Landlord';
      case 'builder': return 'Builder';
      default: return type || 'Client';
    }
  };

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Follow-up</Text>
          <TouchableOpacity onPress={handleDelete} style={styles.deleteHeaderBtn}>
            <Ionicons name="trash-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* Status Toggle */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusToggle}>
              <TouchableOpacity
                style={[
                  styles.statusButton,
                  status === 'pending' && styles.statusButtonActive,
                ]}
                onPress={() => setStatus('pending')}
              >
                <Ionicons
                  name="time-outline"
                  size={18}
                  color={status === 'pending' ? '#F59E0B' : '#9CA3AF'}
                />
                <Text
                  style={[
                    styles.statusButtonText,
                    status === 'pending' && { color: '#F59E0B' },
                  ]}
                >
                  Pending
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.statusButton,
                  status === 'completed' && styles.statusButtonCompleted,
                ]}
                onPress={() => setStatus('completed')}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={status === 'completed' ? '#10B981' : '#9CA3AF'}
                />
                <Text
                  style={[
                    styles.statusButtonText,
                    status === 'completed' && { color: '#10B981' },
                  ]}
                >
                  Completed
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Reminder Type Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Type</Text>
            <View style={styles.typeGrid}>
              {REMINDER_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeButton,
                    reminderType === type.value && { backgroundColor: type.color + '20', borderColor: type.color },
                  ]}
                  onPress={() => setReminderType(type.value)}
                >
                  <Ionicons
                    name={type.icon as any}
                    size={24}
                    color={reminderType === type.value ? type.color : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      reminderType === type.value && { color: type.color },
                    ]}
                  >
                    {type.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Title */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Enter follow-up title"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Client Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Link to Client</Text>
            <TouchableOpacity
              style={styles.selectorButton}
              onPress={() => setShowLeadPicker(true)}
            >
              {selectedLead ? (
                <View style={styles.selectedLeadInfo}>
                  <Ionicons name="person" size={18} color="#3B82F6" />
                  <View style={styles.selectedLeadText}>
                    <Text style={styles.selectedLeadName}>{selectedLead.name}</Text>
                    {selectedLead.phone && (
                      <Text style={styles.selectedLeadPhone}>{selectedLead.phone}</Text>
                    )}
                  </View>
                </View>
              ) : (
                <Text style={styles.placeholderText}>Select a client (optional)</Text>
              )}
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
            {selectedLead && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={() => setSelectedLead(null)}
              >
                <Text style={styles.clearButtonText}>Clear selection</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Date & Time */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date & Time</Text>
            <View style={styles.dateTimeContainer}>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
                <Text style={styles.dateTimeText}>
                  {reminderDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color="#3B82F6" />
                <Text style={styles.dateTimeText}>
                  {reminderDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </TouchableOpacity>
            </View>
            {status === 'pending' && (
              <Text style={styles.notificationHint}>
                <Ionicons name="notifications" size={12} color="#6B7280" /> You'll be notified 10 minutes before
              </Text>
            )}
          </View>

          {showDatePicker && (
            <DateTimePicker
              value={reminderDate}
              mode="date"
              display="default"
              onChange={onDateChange}
            />
          )}

          {showTimePicker && (
            <DateTimePicker
              value={reminderDate}
              mode="time"
              display="default"
              onChange={onTimeChange}
            />
          )}

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
            />
          </View>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            <Ionicons name="save" size={20} color="#FFFFFF" />
            <Text style={styles.submitButtonText}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Lead Picker Modal */}
      <Modal
        visible={showLeadPicker}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Client</Text>
            <TouchableOpacity onPress={() => setShowLeadPicker(false)}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              value={leadSearch}
              onChangeText={setLeadSearch}
              placeholder="Search by name or phone..."
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <FlatList
            data={filteredLeads}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.leadItem}
                onPress={() => {
                  setSelectedLead(item);
                  setShowLeadPicker(false);
                  setLeadSearch('');
                }}
              >
                <View style={styles.leadItemIcon}>
                  <Ionicons name="person" size={20} color="#3B82F6" />
                </View>
                <View style={styles.leadItemContent}>
                  <Text style={styles.leadItemName}>{item.name}</Text>
                  <View style={styles.leadItemMeta}>
                    {item.phone && <Text style={styles.leadItemPhone}>{item.phone}</Text>}
                    <View style={styles.leadTypeBadge}>
                      <Text style={styles.leadTypeText}>{getLeadTypeLabel(item.lead_type)}</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={styles.emptyText}>No clients found</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  headerSafeArea: {
    backgroundColor: '#3B82F6',
  },
  header: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  deleteHeaderBtn: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  statusToggle: {
    flexDirection: 'row',
    gap: 12,
  },
  statusButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  statusButtonActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  statusButtonCompleted: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9CA3AF',
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  typeButton: {
    width: '31%',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  typeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  placeholderText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
  selectedLeadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedLeadText: {
    marginLeft: 10,
  },
  selectedLeadName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  selectedLeadPhone: {
    fontSize: 13,
    color: '#6B7280',
  },
  clearButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  clearButtonText: {
    color: '#EF4444',
    fontSize: 13,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  dateTimeText: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
  notificationHint: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 10,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#1F2937',
  },
  leadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  leadItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leadItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  leadItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  leadItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  leadItemPhone: {
    fontSize: 13,
    color: '#6B7280',
  },
  leadTypeBadge: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  leadTypeText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyList: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
  },
});
