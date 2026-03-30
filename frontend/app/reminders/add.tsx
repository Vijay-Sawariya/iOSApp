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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { api } from '../../services/api';
import { notificationService } from '../../services/notificationService';
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

// Generate time options for picker (every 30 mins)
const generateTimeOptions = () => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour = h % 12 || 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
      options.push({ label, hour: h, minute: m });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// Generate date options (next 30 days)
const generateDateOptions = () => {
  const options = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const label = date.toLocaleDateString('en-IN', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
    options.push({ label, date: new Date(date) });
  }
  return options;
};

export default function AddReminderScreen() {
  const params = useLocalSearchParams();
  const preselectedLeadId = params.lead_id as string | undefined;
  const preselectedLeadName = params.lead_name as string | undefined;

  const [title, setTitle] = useState('');
  const [reminderDate, setReminderDate] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1, 0, 0, 0);
    return date;
  });
  const [reminderType, setReminderType] = useState('Call');
  const [notes, setNotes] = useState('');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  
  const dateOptions = generateDateOptions();

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    if (preselectedLeadId && preselectedLeadName) {
      setSelectedLead({
        id: parseInt(preselectedLeadId),
        name: preselectedLeadName,
        phone: null,
        lead_type: null,
      });
      setTitle(`Follow up with ${preselectedLeadName}`);
    }
  }, [preselectedLeadId, preselectedLeadName]);

  const loadLeads = async () => {
    try {
      const [clients, inventory] = await Promise.all([
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

      if (preselectedLeadId) {
        const lead = allLeads.find(l => l.id === parseInt(preselectedLeadId));
        if (lead) setSelectedLead(lead);
      }
    } catch (error) {
      console.error('Failed to load leads:', error);
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
        status: 'pending',
      };

      const created = await api.createReminder(reminderData);

      await notificationService.scheduleReminderNotification(
        created.id.toString(),
        title,
        `${reminderType} reminder${selectedLead ? ` for ${selectedLead.name}` : ''}`,
        reminderDate,
        selectedLead?.name
      );

      Alert.alert('Success', 'Follow-up created! You will be notified 10 minutes before.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      Alert.alert('Error', 'Failed to create follow-up');
    } finally {
      setLoading(false);
    }
  };

  const handleDateSelect = (selectedDate: Date) => {
    const newDate = new Date(reminderDate);
    newDate.setFullYear(selectedDate.getFullYear());
    newDate.setMonth(selectedDate.getMonth());
    newDate.setDate(selectedDate.getDate());
    setReminderDate(newDate);
    setShowDatePicker(false);
  };

  const handleTimeSelect = (hour: number, minute: number) => {
    const newDate = new Date(reminderDate);
    newDate.setHours(hour, minute, 0, 0);
    setReminderDate(newDate);
    setShowTimePicker(false);
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

  const formatDisplayDate = (date: Date) => {
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Kolkata',
    });
  };

  const formatDisplayTime = (date: Date) => {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>New Follow-up</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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

          {/* Date & Time - Custom Pickers */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date & Time (IST)</Text>
            <View style={styles.dateTimeContainer}>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
                <Text style={styles.dateTimeText}>{formatDisplayDate(reminderDate)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color="#3B82F6" />
                <Text style={styles.dateTimeText}>{formatDisplayTime(reminderDate)}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.notificationHint}>
              🔔 You'll be notified 10 minutes before
            </Text>
          </View>

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
            <Ionicons name="notifications" size={20} color="#FFFFFF" />
            <Text style={styles.submitButtonText}>
              {loading ? 'Creating...' : 'Create Follow-up'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Date</Text>
              <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={dateOptions}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    item.date.toDateString() === reminderDate.toDateString() && styles.pickerItemActive,
                  ]}
                  onPress={() => handleDateSelect(item.date)}
                >
                  <Text style={[
                    styles.pickerItemText,
                    item.date.toDateString() === reminderDate.toDateString() && styles.pickerItemTextActive,
                  ]}>
                    {item.label}
                  </Text>
                  {item.date.toDateString() === reminderDate.toDateString() && (
                    <Ionicons name="checkmark" size={20} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
            />
          </View>
        </View>
      </Modal>

      {/* Time Picker Modal */}
      <Modal visible={showTimePicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Time</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={TIME_OPTIONS}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => {
                const isSelected = reminderDate.getHours() === item.hour && 
                                   reminderDate.getMinutes() === item.minute;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                    onPress={() => handleTimeSelect(item.hour, item.minute)}
                  >
                    <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
                      {item.label}
                    </Text>
                    {isSelected && <Ionicons name="checkmark" size={20} color="#3B82F6" />}
                  </TouchableOpacity>
                );
              }}
              style={{ maxHeight: 400 }}
            />
          </View>
        </View>
      </Modal>

      {/* Lead Picker Modal */}
      <Modal visible={showLeadPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.leadModalContainer}>
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
                  if (!title) setTitle(`Follow up with ${item.name}`);
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 30,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemActive: {
    backgroundColor: '#EFF6FF',
  },
  pickerItemText: {
    fontSize: 16,
    color: '#1F2937',
  },
  pickerItemTextActive: {
    color: '#3B82F6',
    fontWeight: '600',
  },
  leadModalContainer: {
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
