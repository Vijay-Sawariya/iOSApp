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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '../../services/api';
import { Picker } from '@react-native-picker/picker';

export default function AddLeadScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [leadType, setLeadType] = useState('buyer');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [bhk, setBhk] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [leadTemperature, setLeadTemperature] = useState('Hot');
  const [leadStatus, setLeadStatus] = useState('New');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name) {
      Alert.alert('Error', 'Please enter lead name');
      return;
    }

    setLoading(true);
    try {
      await api.createLead({
        name,
        phone: phone || null,
        email: email || null,
        lead_type: leadType,
        location: location || null,
        address: address || null,
        bhk: bhk || null,
        budget_min: budgetMin ? parseFloat(budgetMin) : null,
        budget_max: budgetMax ? parseFloat(budgetMax) : null,
        property_type: propertyType || null,
        lead_temperature: leadTemperature,
        lead_status: leadStatus,
        notes: notes || null,
      });

      Alert.alert('Success', 'Lead created successfully');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Enter lead name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter phone number"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter email"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Lead Type *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={leadType}
                onValueChange={setLeadType}
                style={styles.picker}
              >
                <Picker.Item label="-- Client Leads --" value="" enabled={false} />
                <Picker.Item label="Buyer (Client)" value="buyer" />
                <Picker.Item label="Tenant (Client)" value="tenant" />
                <Picker.Item label="-- Inventory Leads --" value="" enabled={false} />
                <Picker.Item label="Seller (Inventory)" value="seller" />
                <Picker.Item label="Landlord (Inventory)" value="landlord" />
                <Picker.Item label="Builder (Inventory)" value="builder" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Lead Temperature</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={leadTemperature}
                onValueChange={setLeadTemperature}
                style={styles.picker}
              >
                <Picker.Item label="Hot" value="Hot" />
                <Picker.Item label="Warm" value="Warm" />
                <Picker.Item label="Cold" value="Cold" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Status</Text>
            <TextInput
              style={styles.input}
              value={leadStatus}
              onChangeText={setLeadStatus}
              placeholder="Lead status"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Property Details</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location</Text>
            <TextInput
              style={styles.input}
              value={location}
              onChangeText={setLocation}
              placeholder="Enter location"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter full address"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>BHK</Text>
            <TextInput
              style={styles.input}
              value={bhk}
              onChangeText={setBhk}
              placeholder="e.g., 2 BHK, 3 BHK"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Property Type</Text>
            <TextInput
              style={styles.input}
              value={propertyType}
              onChangeText={setPropertyType}
              placeholder="Apartment, Villa, Plot, etc."
            />
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Min Budget (₹)</Text>
              <TextInput
                style={styles.input}
                value={budgetMin}
                onChangeText={setBudgetMin}
                placeholder="Min"
                keyboardType="numeric"
              />
            </View>

            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={styles.label}>Max Budget (₹)</Text>
              <TextInput
                style={styles.input}
                value={budgetMax}
                onChangeText={setBudgetMax}
                placeholder="Max"
                keyboardType="numeric"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>

          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes or comments..."
              multiline
              numberOfLines={4}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
        >
          <Text style={styles.submitButtonText}>
            {loading ? 'Creating...' : 'Create Lead'}
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
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
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
