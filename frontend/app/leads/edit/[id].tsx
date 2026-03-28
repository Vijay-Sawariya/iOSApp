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
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../../../services/api';
import * as Location from 'expo-location';

const LEAD_TYPES = ['buyer', 'tenant', 'seller', 'landlord', 'builder'];
const LEAD_TEMPERATURES = ['Hot', 'Warm', 'Cold'];
const CLIENT_STATUSES = ['New', 'Contacted', 'Qualified', 'Negotiating', 'Won', 'Lost'];
const INVENTORY_STATUSES = ['Under construction', 'Ready to move', 'Near Completion', 'Booking', 'Old', 'Sold'];
const PROPERTY_TYPES = ['Apartment', 'Builder Floor', 'Plot', 'Vila'];
const UNITS = ['CR', 'L', 'K'];
const FLOORS = ['BMT', 'BMT+GF', 'GF', 'FF', 'SF', 'TF', 'TF+Terr'];
const LIFT_OPTIONS = ['Yes', 'No'];

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

interface FloorPrice {
  floor: string;
  price: string;
}

// Custom Dropdown Component for iOS compatibility
const CustomDropdown = ({ 
  label, 
  value, 
  options, 
  onSelect, 
  placeholder = "Select...",
  displayValue 
}: {
  label: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  placeholder?: string;
  displayValue?: string;
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  
  const displayText = displayValue || value || placeholder;
  const hasValue = !!value;

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity 
        style={styles.dropdownButton}
        onPress={() => setModalVisible(true)}
      >
        <Text style={[styles.dropdownText, !hasValue && styles.dropdownPlaceholder]}>
          {displayText}
        </Text>
        <Ionicons name="chevron-down" size={20} color="#6B7280" />
      </TouchableOpacity>
      
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.optionItem, value === item && styles.optionItemSelected]}
                  onPress={() => {
                    onSelect(item);
                    setModalVisible(false);
                  }}
                >
                  <Text style={[styles.optionText, value === item && styles.optionTextSelected]}>
                    {item}
                  </Text>
                  {value === item && (
                    <Ionicons name="checkmark" size={20} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.optionsList}
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

export default function EditLeadScreen() {
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  
  // Basic Info
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
  // Lead Classification
  const [leadType, setLeadType] = useState('buyer');
  const [leadTemperature, setLeadTemperature] = useState('Warm');
  const [leadStatus, setLeadStatus] = useState('New');
  
  // Property Details
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [bhk, setBhk] = useState('');
  const [floor, setFloor] = useState('');
  const [areaSize, setAreaSize] = useState('');
  
  // Budget (for Clients)
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [unit, setUnit] = useState('CR');
  
  // Floor-wise Pricing (for Inventory)
  const [floorPrices, setFloorPrices] = useState<FloorPrice[]>([]);
  
  // Other
  const [parking, setParking] = useState('');
  const [lift, setLift] = useState('');
  const [notes, setNotes] = useState('');
  const [googleMapUrl, setGoogleMapUrl] = useState('');

  const isInventory = ['seller', 'landlord', 'builder'].includes(leadType);

  useEffect(() => {
    loadLead();
  }, [id]);

  const fetchCurrentLocation = async () => {
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to get current location.');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = currentLocation.coords;
      const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      setGoogleMapUrl(mapUrl);
      Alert.alert('Success', 'Current location captured successfully!');
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Failed to get current location. Please try again.');
    } finally {
      setFetchingLocation(false);
    }
  };

  const loadLead = async () => {
    try {
      const data = await api.getLead(String(id));
      console.log('Loaded lead data:', data);
      
      setName(data.name || '');
      setPhone(data.phone || '');
      setEmail(data.email || '');
      setLeadType(data.lead_type || 'buyer');
      setLeadTemperature(data.lead_temperature || 'Warm');
      setLeadStatus(data.lead_status || 'New');
      setLocation(data.location || '');
      setAddress(data.address || '');
      setPropertyType(data.property_type || '');
      setBhk(data.bhk || '');
      setFloor(data.floor || '');
      setAreaSize(data.area_size ? String(data.area_size) : '');
      setBudgetMin(data.budget_min ? String(data.budget_min) : '');
      setBudgetMax(data.budget_max ? String(data.budget_max) : '');
      setUnit(data.unit || 'CR');
      setParking(data.car_parking_number ? String(data.car_parking_number) : '');
      setLift(data.lift_available ? String(data.lift_available) : '');
      setNotes(data.notes || '');
      setGoogleMapUrl(data.Property_locationUrl || data.google_map_url || '');
      
      // Load floor pricing if available
      if (data.floor_pricing && Array.isArray(data.floor_pricing)) {
        const prices = data.floor_pricing.map((fp: any) => ({
          floor: fp.floor_label || '',
          price: fp.floor_amount ? String(fp.floor_amount) : ''
        }));
        setFloorPrices(prices);
      }
    } catch (err) {
      console.error('Failed to load lead:', err);
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const addFloorPrice = () => {
    setFloorPrices([...floorPrices, { floor: '', price: '' }]);
  };

  const updateFloorPrice = (index: number, field: 'floor' | 'price', value: string) => {
    const updated = [...floorPrices];
    updated[index][field] = value;
    setFloorPrices(updated);
  };

  const removeFloorPrice = (index: number) => {
    setFloorPrices(floorPrices.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    setSaving(true);
    try {
      const updateData: any = {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        lead_type: leadType,
        lead_temperature: leadTemperature,
        lead_status: leadStatus,
        location,
        address: address.trim(),
        property_type: propertyType,
        bhk,
        floor,
        area_size: areaSize ? parseFloat(areaSize) : null,
        unit,
        car_parking_number: parking,
        lift_available: lift,
        notes: notes.trim(),
        Property_locationUrl: googleMapUrl.trim(),
      };

      if (isInventory) {
        // For inventory, include floor pricing
        updateData.floor_pricing = floorPrices.filter(fp => fp.floor && fp.price);
      } else {
        // For clients, include budget
        updateData.budget_min = budgetMin ? parseFloat(budgetMin) : null;
        updateData.budget_max = budgetMax ? parseFloat(budgetMax) : null;
      }

      await api.updateLead(String(id), updateData);
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
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter phone number"
            placeholderTextColor="#9CA3AF"
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter email"
            placeholderTextColor="#9CA3AF"
            keyboardType="email-address"
          />
        </View>

        {/* Lead Classification */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lead Classification</Text>
          
          <CustomDropdown
            label="Lead Type"
            value={leadType}
            options={LEAD_TYPES}
            onSelect={setLeadType}
            displayValue={leadType.charAt(0).toUpperCase() + leadType.slice(1)}
          />

          <CustomDropdown
            label="Temperature"
            value={leadTemperature}
            options={LEAD_TEMPERATURES}
            onSelect={setLeadTemperature}
          />

          <CustomDropdown
            label="Status"
            value={leadStatus}
            options={isInventory ? INVENTORY_STATUSES : CLIENT_STATUSES}
            onSelect={setLeadStatus}
          />
        </View>

        {/* Property Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Property Details</Text>
          
          <CustomDropdown
            label="Location"
            value={location}
            options={LOCATIONS}
            onSelect={setLocation}
            placeholder="Select Location"
          />

          {isInventory && (
            <>
              <Text style={styles.label}>Address</Text>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Enter property address"
                placeholderTextColor="#9CA3AF"
              />

              <Text style={styles.label}>Google Map URL</Text>
              <View style={styles.mapUrlRow}>
                <TextInput
                  style={styles.mapUrlInput}
                  value={googleMapUrl}
                  onChangeText={setGoogleMapUrl}
                  placeholder="https://maps.google.com/..."
                  placeholderTextColor="#9CA3AF"
                />
                <TouchableOpacity 
                  style={styles.locationButton}
                  onPress={fetchCurrentLocation}
                  disabled={fetchingLocation}
                >
                  {fetchingLocation ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons name="location" size={22} color="#FFFFFF" />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          <CustomDropdown
            label="Property Type"
            value={propertyType}
            options={PROPERTY_TYPES}
            onSelect={setPropertyType}
            placeholder="Select Type"
          />

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.label}>BHK</Text>
              <TextInput
                style={styles.input}
                value={bhk}
                onChangeText={setBhk}
                placeholder="e.g., 3 BHK"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <View style={styles.halfField}>
              <CustomDropdown
                label="Floor"
                value={floor}
                options={FLOORS}
                onSelect={setFloor}
                placeholder="Select Floor"
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
                placeholder="e.g., 200"
                placeholderTextColor="#9CA3AF"
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
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
              />
            </View>
          </View>

          {isInventory && (
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Lift</Text>
                <View style={styles.radioGroup}>
                  {LIFT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option}
                      style={styles.radioOption}
                      onPress={() => setLift(option)}
                    >
                      <View style={[styles.radioCircle, lift === option && styles.radioCircleSelected]}>
                        {lift === option && <View style={styles.radioInner} />}
                      </View>
                      <Text style={[styles.radioLabel, lift === option && styles.radioLabelSelected]}>
                        {option}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.halfField}>
                <CustomDropdown
                  label="Unit"
                  value={unit}
                  options={UNITS}
                  onSelect={setUnit}
                />
              </View>
            </View>
          )}
        </View>

        {/* Floor-wise Pricing (for Inventory) */}
        {isInventory && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitleNoMargin}>Asking Price (Floor-wise)</Text>
              <TouchableOpacity style={styles.addButton} onPress={addFloorPrice}>
                <Ionicons name="add-circle" size={28} color="#10B981" />
              </TouchableOpacity>
            </View>

            {floorPrices.length === 0 && (
              <Text style={styles.emptyText}>No floor prices added. Tap + to add.</Text>
            )}

            {floorPrices.map((fp, index) => (
              <View key={index} style={styles.floorPriceRow}>
                <View style={styles.floorDropdownContainer}>
                  <TouchableOpacity
                    style={styles.floorDropdownButton}
                    onPress={() => {
                      Alert.alert(
                        'Select Floor',
                        '',
                        FLOORS.map(f => ({
                          text: f,
                          onPress: () => updateFloorPrice(index, 'floor', f)
                        }))
                      );
                    }}
                  >
                    <Text style={[styles.floorDropdownText, !fp.floor && styles.dropdownPlaceholder]}>
                      {fp.floor || 'Floor'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#6B7280" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.priceInput}
                  value={fp.price}
                  onChangeText={(value) => updateFloorPrice(index, 'price', value)}
                  placeholder="Price"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
                <TouchableOpacity onPress={() => removeFloorPrice(index)} style={styles.removeButton}>
                  <Ionicons name="close-circle" size={24} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Budget (for Clients) */}
        {!isInventory && (
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
                  placeholderTextColor="#9CA3AF"
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
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.thirdField}>
                <CustomDropdown
                  label="Unit"
                  value={unit}
                  options={UNITS}
                  onSelect={setUnit}
                />
              </View>
            </View>
          </View>
        )}

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes..."
            placeholderTextColor="#9CA3AF"
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  sectionTitleNoMargin: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
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
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 16,
  },
  // Custom Dropdown Styles
  dropdownButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    fontSize: 16,
    color: '#1F2937',
  },
  dropdownPlaceholder: {
    color: '#9CA3AF',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  optionsList: {
    maxHeight: 400,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  optionItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  optionText: {
    fontSize: 16,
    color: '#1F2937',
  },
  optionTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
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
  addButton: {
    padding: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  floorPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  floorDropdownContainer: {
    flex: 1,
    marginRight: 8,
  },
  floorDropdownButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  floorDropdownText: {
    fontSize: 16,
    color: '#1F2937',
  },
  priceInput: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#1F2937',
    marginRight: 8,
  },
  removeButton: {
    padding: 4,
  },
  bottomPadding: {
    height: 40,
  },
  // Map URL and Location Button
  mapUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  mapUrlInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  locationButton: {
    backgroundColor: '#10B981',
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Radio Button Styles
  radioGroup: {
    flexDirection: 'row',
    gap: 20,
    paddingVertical: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  radioCircleSelected: {
    borderColor: '#3B82F6',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#3B82F6',
  },
  radioLabel: {
    fontSize: 15,
    color: '#6B7280',
  },
  radioLabelSelected: {
    color: '#1F2937',
    fontWeight: '500',
  },
});
