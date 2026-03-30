import React, { useState, useEffect, useCallback } from 'react';
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
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { api } from '../../../services/api';
import { notificationService } from '../../../services/notificationService';

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

// Generate time options (every 30 mins) - these are IST times
const generateTimeOptions = () => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour12 = h % 12 || 12;
      const ampm = h < 12 ? 'AM' : 'PM';
      const label = `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
      options.push({ label, hour24: h, minute: m });
    }
  }
  return options;
};

const TIME_OPTIONS = generateTimeOptions();

// Generate date options (past 7 days + next 30 days)
const generateDateOptions = () => {
  const options = [];
  // Get current date in IST
  const now = new Date();
  const istOffset = 5.5 * 60;
  const utcOffset = now.getTimezoneOffset();
  const istTime = new Date(now.getTime() + (utcOffset + istOffset) * 60 * 1000);
  
  for (let i = -7; i < 30; i++) {
    const date = new Date(istTime);
    date.setDate(istTime.getDate() + i);
    const label = date.toLocaleDateString('en-IN', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric'
    });
    options.push({ 
      label, 
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate()
    });
  }
  return options;
};

export default function EditReminderScreen() {
  const { id } = useLocalSearchParams();
  const reminderId = id as string;

  // Store date and time separately as IST values
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [selectedMonth, setSelectedMonth] = useState<number>(0);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [selectedHour, setSelectedHour] = useState<number>(0);
  const [selectedMinute, setSelectedMinute] = useState<number>(0);
  
  const [title, setTitle] = useState('');
  const [reminderType, setReminderType] = useState('Call');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('pending');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  
  // Client search state
  const [leadSearch, setLeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  
  const dateOptions = generateDateOptions();

  useEffect(() => {
    loadData();
  }, [reminderId]);

  const loadData = async () => {
    try {
      const reminders = await api.getReminders();

      const reminder = reminders.find((r: any) => r.id.toString() === reminderId);
      if (reminder) {
        setTitle(reminder.title);
        setReminderType(reminder.reminder_type);
        setNotes(reminder.notes || '');
        setStatus(reminder.status);

        // Parse the reminder_date which is stored in IST format (YYYY-MM-DDTHH:MM:SS)
        const dateStr = reminder.reminder_date;
        if (dateStr && dateStr.includes('T')) {
          const [datePart, timePart] = dateStr.split('T');
          const [year, month, day] = datePart.split('-').map(Number);
          const [hours, minutes] = timePart.split(':').map(Number);
          
          setSelectedYear(year);
          setSelectedMonth(month);
          setSelectedDay(day);
          setSelectedHour(hours);
          setSelectedMinute(minutes);
        } else if (dateStr) {
          // Fallback for other formats
          const date = new Date(dateStr);
          setSelectedYear(date.getFullYear());
          setSelectedMonth(date.getMonth() + 1);
          setSelectedDay(date.getDate());
          setSelectedHour(date.getHours());
          setSelectedMinute(date.getMinutes());
        }

        // If there's a linked lead, fetch it for display
        if (reminder.lead_id) {
          try {
            const [clients, inventory] = await Promise.all([
              api.getClientLeads(),
              api.getInventoryLeads(),
            ]);
            const allLeads = [...clients, ...inventory];
            const lead = allLeads.find(l => l.id === reminder.lead_id);
            if (lead) {
              setSelectedLead({
                id: lead.id,
                name: lead.name,
                phone: lead.phone,
                lead_type: lead.lead_type,
              });
            }
          } catch (e) {
            console.error('Failed to load lead details:', e);
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

  // Debounced search for clients
  const searchClients = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setSearchLoading(true);
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
      
      // Filter by search query
      const filtered = allLeads.filter(l =>
        l.name.toLowerCase().includes(query.toLowerCase()) ||
        (l.phone && l.phone.includes(query))
      );
      
      setSearchResults(filtered.slice(0, 20));
    } catch (error) {
      console.error('Failed to search clients:', error);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (leadSearch.length >= 2) {
        searchClients(leadSearch);
      } else {
        setSearchResults([]);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [leadSearch, searchClients]);

  const handleSubmit = async () => {
    if (!title) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }

    setLoading(true);
    try {
      // Format date and time as IST string for backend
      // The backend stores these as-is (IST) without timezone conversion
      const dateStr = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-${selectedDay.toString().padStart(2, '0')}`;
      const timeStr = `${selectedHour.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}:00`;
      const reminderDateIST = `${dateStr}T${timeStr}`;

      const reminderData = {
        title,
        reminder_date: reminderDateIST,
        reminder_type: reminderType,
        notes: notes || null,
        lead_id: selectedLead?.id || null,
        status,
      };

      console.log('Updating reminder with IST time:', reminderDateIST);
      await api.updateReminder(reminderId, reminderData);

      // Schedule or cancel notification based on status
      if (status === 'pending') {
        await notificationService.scheduleReminderNotificationIST(
          reminderId,
          title,
          `${reminderType} reminder${selectedLead ? ` for ${selectedLead.name}` : ''}`,
          selectedYear,
          selectedMonth,
          selectedDay,
          selectedHour,
          selectedMinute,
          selectedLead?.name
        );
      } else {
        await notificationService.cancelReminderNotification(reminderId);
      }

      Alert.alert('Success', 'Follow-up updated successfully!', [
        { text: 'OK', onPress: () => router.replace('/(tabs)/reminders') }
      ]);
    } catch (error) {
      console.error('Update error:', error);
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
            router.replace('/(tabs)/reminders');
          } catch (error) {
            Alert.alert('Error', 'Failed to delete follow-up');
          }
        },
      },
    ]);
  };

  const handleDateSelect = (option: { year: number; month: number; day: number }) => {
    setSelectedYear(option.year);
    setSelectedMonth(option.month);
    setSelectedDay(option.day);
    setShowDatePicker(false);
  };

  const handleTimeSelect = (option: { hour24: number; minute: number }) => {
    setSelectedHour(option.hour24);
    setSelectedMinute(option.minute);
    setShowTimePicker(false);
  };

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

  // Format display date (IST)
  const formatDisplayDate = () => {
    if (!selectedYear) return 'Select Date';
    const date = new Date(selectedYear, selectedMonth - 1, selectedDay);
    return date.toLocaleDateString('en-IN', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Format display time (IST)
  const formatDisplayTime = () => {
    const hour12 = selectedHour % 12 || 12;
    const ampm = selectedHour < 12 ? 'am' : 'pm';
    return `${hour12.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')} ${ampm}`;
  };

  // Check if current selection matches picker option
  const isDateSelected = (option: { year: number; month: number; day: number }) => {
    return option.year === selectedYear && option.month === selectedMonth && option.day === selectedDay;
  };

  const isTimeSelected = (option: { hour24: number; minute: number }) => {
    return option.hour24 === selectedHour && option.minute === selectedMinute;
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
      <Stack.Screen options={{ headerShown: false }} />
      
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

          {/* Date & Time - IST */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date & Time (IST)</Text>
            <View style={styles.dateTimeContainer}>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color="#3B82F6" />
                <Text style={styles.dateTimeText}>{formatDisplayDate()}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color="#3B82F6" />
                <Text style={styles.dateTimeText}>{formatDisplayTime()}</Text>
              </TouchableOpacity>
            </View>
            {status === 'pending' && (
              <Text style={styles.notificationHint}>
                🔔 You'll be notified 10 minutes before (IST)
              </Text>
            )}
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
            <Ionicons name="save" size={20} color="#FFFFFF" />
            <Text style={styles.submitButtonText}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>

          {/* Delete Button */}
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color="#EF4444" />
            <Text style={styles.deleteButtonText}>Delete Follow-up</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Date Picker Modal */}
      <Modal visible={showDatePicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Date (IST)</Text>
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
                    isDateSelected(item) && styles.pickerItemActive,
                  ]}
                  onPress={() => handleDateSelect(item)}
                >
                  <Text style={[
                    styles.pickerItemText,
                    isDateSelected(item) && styles.pickerItemTextActive,
                  ]}>
                    {item.label}
                  </Text>
                  {isDateSelected(item) && (
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
              <Text style={styles.pickerTitle}>Select Time (IST)</Text>
              <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={TIME_OPTIONS}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerItem,
                    isTimeSelected(item) && styles.pickerItemActive,
                  ]}
                  onPress={() => handleTimeSelect(item)}
                >
                  <Text style={[
                    styles.pickerItemText,
                    isTimeSelected(item) && styles.pickerItemTextActive,
                  ]}>
                    {item.label}
                  </Text>
                  {isTimeSelected(item) && (
                    <Ionicons name="checkmark" size={20} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
            />
          </View>
        </View>
      </Modal>

      {/* Lead Picker Modal - Search Based */}
      <Modal visible={showLeadPicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.leadModalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Search Client</Text>
            <TouchableOpacity onPress={() => {
              setShowLeadPicker(false);
              setLeadSearch('');
              setSearchResults([]);
            }}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.searchInput}
              value={leadSearch}
              onChangeText={setLeadSearch}
              placeholder="Type at least 2 characters to search..."
              placeholderTextColor="#9CA3AF"
              autoFocus
            />
            {searchLoading && (
              <ActivityIndicator size="small" color="#3B82F6" />
            )}
          </View>

          {leadSearch.length < 2 ? (
            <View style={styles.emptyList}>
              <Ionicons name="information-circle-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>Enter client name or phone number</Text>
              <Text style={styles.emptySubtext}>Minimum 2 characters required</Text>
            </View>
          ) : searchResults.length === 0 && !searchLoading ? (
            <View style={styles.emptyList}>
              <Ionicons name="search-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No clients found</Text>
              <Text style={styles.emptySubtext}>Try a different search term</Text>
            </View>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.leadItem}
                  onPress={() => {
                    setSelectedLead(item);
                    setShowLeadPicker(false);
                    setLeadSearch('');
                    setSearchResults([]);
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
            />
          )}
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
    marginBottom: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteButtonText: {
    color: '#EF4444',
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
    flex: 1,
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
});
