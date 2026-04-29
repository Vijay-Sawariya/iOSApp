import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { LOCATIONS } from '../../constants/leadOptions';

// Time options for dropdown
const TIME_OPTIONS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00'
];

export default function AddSiteVisitScreen() {
  const { token } = useAuth();
  const params = useLocalSearchParams();
  const leadId = params.lead_id as string;
  const leadName = params.lead_name as string;
  
  const [loading, setLoading] = useState(false);
  const [savingVisit, setSavingVisit] = useState(false);
  const [lead, setLead] = useState<any>(null);
  
  // Date/Time picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Location dropdown state
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [filteredLocations, setFilteredLocations] = useState<string[]>(LOCATIONS);
  
  // Form state
  const [visitForm, setVisitForm] = useState({
    lead_id: leadId || '',
    lead_name: leadName || '',
    lead_phone: '',
    property_name: '',
    property_location: '',
    visit_date: new Date().toISOString().split('T')[0],
    visit_time: '10:00',
    location: '',
    notes: '',
  });

  // Load lead data if leadId is provided
  useEffect(() => {
    if (leadId && token) {
      loadLeadData();
    }
  }, [leadId, token]);

  const loadLeadData = async () => {
    try {
      setLoading(true);
      const data = await api.getLead(leadId);
      if (data) {
        setLead(data);
        setVisitForm(prev => ({
          ...prev,
          lead_id: String(data.id),
          lead_name: data.name || '',
          lead_phone: data.phone || '',
          property_name: data.name || '',
          property_location: data.location || '',
          location: data.location || '',
        }));
      }
    } catch (error) {
      console.error('Failed to load lead:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (event: any, selectedDateValue?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDateValue) {
      setSelectedDate(selectedDateValue);
      setVisitForm(prev => ({
        ...prev,
        visit_date: selectedDateValue.toISOString().split('T')[0]
      }));
    }
  };

  const handleTimeChange = (event: any, selectedTimeValue?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTimeValue) {
      const hours = selectedTimeValue.getHours().toString().padStart(2, '0');
      const minutes = selectedTimeValue.getMinutes().toString().padStart(2, '0');
      setVisitForm(prev => ({
        ...prev,
        visit_time: `${hours}:${minutes}`
      }));
    }
  };

  const handleLocationSearch = (text: string) => {
    setVisitForm(prev => ({ ...prev, location: text }));
    if (text.length > 0) {
      const filtered = LOCATIONS.filter(loc => 
        loc.toLowerCase().includes(text.toLowerCase())
      );
      setFilteredLocations(filtered);
      setShowLocationDropdown(true);
    } else {
      setFilteredLocations(LOCATIONS);
      setShowLocationDropdown(false);
    }
  };

  const selectLocation = (location: string) => {
    setVisitForm(prev => ({ ...prev, location }));
    setShowLocationDropdown(false);
  };

  const handleSaveVisit = async () => {
    if (!visitForm.lead_name.trim()) {
      Alert.alert('Error', 'Please enter lead name');
      return;
    }
    if (!visitForm.visit_date) {
      Alert.alert('Error', 'Please select a visit date');
      return;
    }

    try {
      setSavingVisit(true);
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/site-visits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...visitForm,
          lead_id: parseInt(visitForm.lead_id) || null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create site visit');
      }

      Alert.alert('Success', 'Site visit scheduled successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      console.error('Failed to save visit:', error);
      Alert.alert('Error', error.message || 'Failed to schedule site visit');
    } finally {
      setSavingVisit(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading lead data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Schedule Site Visit</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Lead Info Card */}
        {lead && (
          <View style={styles.leadInfoCard}>
            <Ionicons name="person" size={24} color="#3B82F6" />
            <View style={styles.leadInfoContent}>
              <Text style={styles.leadInfoName}>{lead.name}</Text>
              {lead.phone && <Text style={styles.leadInfoPhone}>{lead.phone}</Text>}
              {lead.location && <Text style={styles.leadInfoLocation}>{lead.location}</Text>}
            </View>
          </View>
        )}

        {/* Form */}
        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Visit Details</Text>

          {/* Property Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Property/Lead Name *</Text>
            <TextInput
              style={styles.input}
              value={visitForm.lead_name}
              onChangeText={(text) => setVisitForm(prev => ({ ...prev, lead_name: text }))}
              placeholder="Enter property or lead name"
              placeholderTextColor="#9CA3AF"
            />
          </View>

          {/* Phone */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Contact Phone</Text>
            <TextInput
              style={styles.input}
              value={visitForm.lead_phone}
              onChangeText={(text) => setVisitForm(prev => ({ ...prev, lead_phone: text }))}
              placeholder="Enter contact phone"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />
          </View>

          {/* Location */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Location</Text>
            <TextInput
              style={styles.input}
              value={visitForm.location}
              onChangeText={handleLocationSearch}
              placeholder="Search or enter location"
              placeholderTextColor="#9CA3AF"
            />
            {showLocationDropdown && filteredLocations.length > 0 && (
              <View style={styles.dropdown}>
                <ScrollView style={styles.dropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {filteredLocations.slice(0, 6).map((loc, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.dropdownItem}
                      onPress={() => selectLocation(loc)}
                    >
                      <Text style={styles.dropdownItemText}>{loc}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Date */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Visit Date *</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => setShowDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color="#6B7280" />
              <Text style={styles.dateInputText}>{visitForm.visit_date || 'Select date'}</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            )}
          </View>

          {/* Time */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Visit Time</Text>
            <TouchableOpacity
              style={styles.dateInput}
              onPress={() => setShowTimePicker(true)}
            >
              <Ionicons name="time-outline" size={20} color="#6B7280" />
              <Text style={styles.dateInputText}>{visitForm.visit_time || 'Select time'}</Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePicker
                value={new Date(`2000-01-01T${visitForm.visit_time}:00`)}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={handleTimeChange}
              />
            )}
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={visitForm.notes}
              onChangeText={(text) => setVisitForm(prev => ({ ...prev, notes: text }))}
              placeholder="Add any notes about the visit..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, savingVisit && styles.saveButtonDisabled]}
          onPress={handleSaveVisit}
          disabled={savingVisit}
        >
          {savingVisit ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
              <Text style={styles.saveButtonText}>Schedule Visit</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
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
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  leadInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  leadInfoContent: {
    marginLeft: 12,
    flex: 1,
  },
  leadInfoName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E40AF',
  },
  leadInfoPhone: {
    fontSize: 14,
    color: '#3B82F6',
    marginTop: 2,
  },
  leadInfoLocation: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dateInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  dateInputText: {
    fontSize: 15,
    color: '#1F2937',
    flex: 1,
  },
  dropdown: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    zIndex: 1000,
    maxHeight: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#1F2937',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 20,
    gap: 8,
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
