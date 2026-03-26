import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { api } from '../../../services/api';

const LEAD_TYPES = ['buyer', 'tenant', 'seller', 'landlord', 'builder'];
const LEAD_TEMPERATURES = ['Hot', 'Warm', 'Cold'];
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Negotiating', 'Won', 'Lost'];
const PROPERTY_TYPES = ['Apartment', 'Builder', 'Plot', 'Vila'];
const PROPERTY_STATUSES = ['Under construction', 'Ready to move', 'Near Completion', 'Booking', 'Old', 'Sold'];
const UNITS = ['CR', 'L', 'K'];
const FLOORS = ['BMT', 'BMT+GF', 'GF', 'FF', 'SF', 'TF', 'TF+Terr'];
const FACING = ['South', 'North', 'East', 'West', 'Southeast', 'Southwest', 'Northeast', 'Northwest'];

const LOCATIONS = [
  "Hauz Khas", "Sunder Nagar", "Shanti Niketan", "Panchsheel Park", "Panchsheel Enclave",
  "Defence Colony", "New Friends Colony", "Golf Links", "Anand Niketan", "Saket", "Shivalik",
  "Sarvapriya Vihar", "Chanakyapuri", "Lajpat Nagar", "Lajpat Nagar- III", "Anand Lok",
  "CR Park", "East of Kailash", "Friends Colony", "Friends Colony East", "Friends Colony West",
  "Gulmohar Park", "Green Park", "Green Park Extension", "Safdarjung Enclave", "SDA",
  "Malviya Nagar", "Vasant Kunj", "Hauz Khas Enclave", "Jor Bagh", "Lodi Road", "Lodi Colony",
  "Nizamuddin East", "Nizamuddin West", "Geetanjali Enclave", "Jor Bagh Enclave", "Kalkaji",
  "Kalkaji Enclave", "Kashmere Gate", "Kashmere Gate Enclave", "Sarvodaya Enclave", "Neeti Bagh",
  "Pamposh Enclave", "Nehru Enclave", "Munirka Vihar", "Andrews Ganj", "Hamdard Nagar",
  "Maurice Nagar", "Bhikaji Cama Place", "Basant Lok DDA Complex", "Malcha Marg", "South Ex 1",
  "South Ex 2", "Uday Park", "National Park", "Chattapur Farm", "Sultanpur Farms", "Maharani Bagh",
  "Kailash Colony", "Soami Nagar", "Sukhdev Vihar", "Masjid Moth", "Navjeevan Vihar",
  "Jangpura Extension", "Hemkunt colony", "Chirag Enclave", "West End", "Pashmi Marg",
  "Rajdoot Marg", "Hanuman Road"
];

export default function EditLeadScreen() {
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [leadType, setLeadType] = useState('buyer');
  const [leadTemperature, setLeadTemperature] = useState('Warm');
  const [leadStatus, setLeadStatus] = useState('New');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [propertyStatus, setPropertyStatus] = useState('');
  const [bhk, setBhk] = useState('');
  const [floor, setFloor] = useState('');
  const [areaSize, setAreaSize] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [unit, setUnit] = useState('CR');
  const [parking, setParking] = useState('');
  const [lift, setLift] = useState('');
  const [notes, setNotes] = useState('');
  const [googleMapUrl, setGoogleMapUrl] = useState('');

  useEffect(() => {
    loadLead();
  }, [id]);

  const loadLead = async () => {
    try {
      const data = await api.getLead(String(id));
      setName(data.name || '');
      setPhone(data.phone || '');
      setEmail(data.email || '');
      setLeadType(data.lead_type || 'buyer');
      setLeadTemperature(data.lead_temperature || 'Warm');
      setLeadStatus(data.lead_status || 'New');
      setLocation(data.location || '');
      setAddress(data.address || '');
      setPropertyType(data.property_type || '');
      setPropertyStatus(data.property_status || '');
      setBhk(data.bhk || '');
      setFloor(data.floor || '');
      setAreaSize(data.area_size ? String(data.area_size) : '');
      setBudgetMin(data.budget_min ? String(data.budget_min) : '');
      setBudgetMax(data.budget_max ? String(data.budget_max) : '');
      setUnit(data.unit || 'CR');
      setParking(data.car_parking_number || '');
      setLift(data.lift_available || '');
      setNotes(data.notes || '');
      setGoogleMapUrl(data.Property_locationUrl || '');
    } catch (err) {
      console.error('Failed to load lead:', err);
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      await api.updateLead(String(id), {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        lead_type: leadType,
        lead_temperature: leadTemperature,
        lead_status: leadStatus,
        location,
        address: address.trim(),
        property_type: propertyType,
        property_status: propertyStatus,
        bhk,
        floor,
        area_size: areaSize ? parseFloat(areaSize) : null,
        budget_min: budgetMin ? parseFloat(budgetMin) : null,
        budget_max: budgetMax ? parseFloat(budgetMax) : null,
        unit,
        car_parking_number: parking,
        lift_available: lift,
        notes: notes.trim(),
        Property_locationUrl: googleMapUrl.trim(),
      });
      Alert.alert('Success', 'Lead updated successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err) {
      console.error('Failed to update lead:', err);
      Alert.alert('Error', 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const isInventory = ['seller', 'landlord', 'builder'].includes(leadType);

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Lead</Text>
        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.disabledButton]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Basic Information</Text>
          
          <Text style={styles.label}>Name *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter name"
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter phone"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter email"
            keyboardType="email-address"
          />
        </View>

        {/* Lead Classification */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lead Classification</Text>
          
          <Text style={styles.label}>Lead Type</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={leadType}
              onValueChange={setLeadType}
              style={styles.picker}
            >
              {LEAD_TYPES.map((type) => (
                <Picker.Item key={type} label={type.charAt(0).toUpperCase() + type.slice(1)} value={type} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Temperature</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={leadTemperature}
              onValueChange={setLeadTemperature}
              style={styles.picker}
            >
              {LEAD_TEMPERATURES.map((temp) => (
                <Picker.Item key={temp} label={temp} value={temp} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Status</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={leadStatus}
              onValueChange={setLeadStatus}
              style={styles.picker}
            >
              {LEAD_STATUSES.map((status) => (
                <Picker.Item key={status} label={status} value={status} />
              ))}
            </Picker>
          </View>
        </View>

        {/* Property Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Property Details</Text>
          
          <Text style={styles.label}>Location</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={location}
              onValueChange={setLocation}
              style={styles.picker}
            >
              <Picker.Item label="Select Location" value="" />
              {LOCATIONS.map((loc) => (
                <Picker.Item key={loc} label={loc} value={loc} />
              ))}
            </Picker>
          </View>

          {isInventory && (
            <>
              <Text style={styles.label}>Address</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter property address"
              />

              <Text style={styles.label}>Google Map URL</Text>
              <TextInput
                style={styles.input}
                value={googleMapUrl}
                onChangeText={setGoogleMapUrl}
                placeholder="https://maps.google.com/..."
              />
            </>
          )}

          <Text style={styles.label}>Property Type</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={propertyType}
              onValueChange={setPropertyType}
              style={styles.picker}
            >
              <Picker.Item label="Select Type" value="" />
              {PROPERTY_TYPES.map((type) => (
                <Picker.Item key={type} label={type} value={type} />
              ))}
            </Picker>
          </View>

          {isInventory && (
            <>
              <Text style={styles.label}>Property Status</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={propertyStatus}
                  onValueChange={setPropertyStatus}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Status" value="" />
                  {PROPERTY_STATUSES.map((status) => (
                    <Picker.Item key={status} label={status} value={status} />
                  ))}
                </Picker>
              </View>
            </>
          )}

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>BHK</Text>
              <TextInput
                style={styles.input}
                value={bhk}
                onChangeText={setBhk}
                placeholder="e.g., 3 BHK"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Floor</Text>
              <TextInput
                style={styles.input}
                value={floor}
                onChangeText={setFloor}
                placeholder="e.g., GF, FF, SF"
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Area (sq.yds)</Text>
              <TextInput
                style={styles.input}
                value={areaSize}
                onChangeText={setAreaSize}
                placeholder="Enter area"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Parking</Text>
              <TextInput
                style={styles.input}
                value={parking}
                onChangeText={setParking}
                placeholder="e.g., 2"
              />
            </View>
          </View>
        </View>

        {/* Budget */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Budget</Text>
          
          <View style={styles.row}>
            <View style={styles.thirdField}>
              <Text style={styles.label}>Min</Text>
              <TextInput
                style={styles.input}
                value={budgetMin}
                onChangeText={setBudgetMin}
                placeholder="Min"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.thirdField}>
              <Text style={styles.label}>Max</Text>
              <TextInput
                style={styles.input}
                value={budgetMax}
                onChangeText={setBudgetMax}
                placeholder="Max"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.thirdField}>
              <Text style={styles.label}>Unit</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={unit}
                  onValueChange={setUnit}
                  style={styles.picker}
                >
                  {UNITS.map((u) => (
                    <Picker.Item key={u} label={u} value={u} />
                  ))}
                </Picker>
              </View>
            </View>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes..."
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </KeyboardAvoidingView>
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
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  content: {
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
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 14,
    fontSize: 14,
    color: '#1F2937',
    marginBottom: 16,
  },
  pickerContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: '#1F2937',
  },
  row: {
    flexDirection: 'row',
    marginHorizontal: -8,
  },
  halfField: {
    flex: 1,
    paddingHorizontal: 8,
  },
  thirdField: {
    flex: 1,
    paddingHorizontal: 8,
  },
  notesInput: {
    textAlignVertical: 'top',
    minHeight: 100,
  },
  bottomPadding: {
    height: 40,
  },
});
