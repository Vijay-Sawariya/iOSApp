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
  Switch,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { router } from 'expo-router';
import { api } from '../../services/api';
import DateTimePicker from '@react-native-community/datetimepicker';

interface Lead {
  id: string;
  name: string;
}

export default function AddReminderScreen() {
  const [title, setTitle] = useState('');
  const [reminderDate, setReminderDate] = useState(new Date());
  const [reminderType, setReminderType] = useState('Call');
  const [notes, setNotes] = useState('');
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [leadId, setLeadId] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const data = await api.getLeads();
      setLeads(data);
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
      await api.createReminder({
        title,
        reminder_date: reminderDate.toISOString(),
        reminder_type: reminderType,
        notes: notes || null,
        send_whatsapp: sendWhatsapp,
        whatsapp_message: sendWhatsapp ? whatsappMessage : null,
        lead_id: leadId || null,
      });

      Alert.alert('Success', 'Reminder created successfully');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to create reminder');
    } finally {
      setLoading(false);
    }
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reminder Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Enter reminder title"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={reminderType}
                onValueChange={setReminderType}
                style={styles.picker}
              >
                <Picker.Item label="Call" value="Call" />
                <Picker.Item label="WhatsApp" value="WhatsApp" />
                <Picker.Item label="Email" value="Email" />
                <Picker.Item label="Meeting" value="Meeting" />
                <Picker.Item label="Site Visit" value="Site Visit" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Lead (Optional)</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={leadId}
                onValueChange={setLeadId}
                style={styles.picker}
              >
                <Picker.Item label="No lead selected" value="" />
                {leads.map((lead) => (
                  <Picker.Item key={lead.id} label={lead.name} value={lead.id} />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Date & Time</Text>
            <View style={styles.dateTimeContainer}>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.dateTimeText}>
                  {reminderDate.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.dateTimeText}>
                  {reminderDate.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </TouchableOpacity>
            </View>
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

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes..."
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>WhatsApp Notification</Text>

          <View style={styles.switchRow}>
            <Text style={styles.label}>Send WhatsApp Message</Text>
            <Switch
              value={sendWhatsapp}
              onValueChange={setSendWhatsapp}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={sendWhatsapp ? '#3B82F6' : '#f4f3f4'}
            />
          </View>

          {sendWhatsapp && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>WhatsApp Message</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={whatsappMessage}
                onChangeText={setWhatsappMessage}
                placeholder="Enter message to send via WhatsApp..."
                multiline
                numberOfLines={4}
              />
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Creating...' : 'Create Reminder'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
  },
  dateTimeContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  dateTimeText: {
    fontSize: 16,
    color: '#1F2937',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  submitButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});