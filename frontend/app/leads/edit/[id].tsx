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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../../../services/api';
import * as Location from 'expo-location';

// Import shared components
import { CustomDropdown } from '../../../components/forms/CustomDropdown';
import { FormInput } from '../../../components/forms/FormInput';
import { RadioButtonGroup } from '../../../components/forms/RadioButtonGroup';

// Import constants
import {
  LEAD_TYPES,
  LEAD_TEMPERATURES,
  CLIENT_STATUSES,
  INVENTORY_STATUSES,
  PROPERTY_TYPES,
  BHK_OPTIONS,
  UNITS,
  FLOORS,
  FACINGS,
  LIFT_OPTIONS,
  LOCATIONS,
  AMENITIES,
  FloorPrice,
  isInventoryType,
  isClientType,
} from '../../../constants/leadOptions';

export default function EditLeadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [builders, setBuilders] = useState<any[]>([]);
  
  // Basic Info
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
  // Lead Classification
  const [leadType, setLeadType] = useState('seller');
  const [leadTemperature, setLeadTemperature] = useState('Hot');
  const [leadStatus, setLeadStatus] = useState('');
  
  // Property Details
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [bhk, setBhk] = useState('');
  const [floor, setFloor] = useState('');
  const [areaSize, setAreaSize] = useState('');
  const [facing, setFacing] = useState('');
  
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
  const [builderId, setBuilderId] = useState('');
  
  // Additional Amenities (boolean toggles)
  const [amenities, setAmenities] = useState({
    park_facing: false,
    park_at_rear: false,
    wide_road: false,
    peaceful_location: false,
    main_road: false,
    corner: false,
  });

  const isInventory = isInventoryType(leadType);
  const isClient = isClientType(leadType);

  useEffect(() => {
    loadLead();
    loadBuilders();
  }, [id]);

  const loadBuilders = async () => {
    try {
      const data = await api.getBuilders();
      setBuilders(data);
    } catch (error) {
      console.error('Failed to load builders:', error);
    }
  };

  const loadLead = async () => {
    if (!id) return;
    try {
      const data = await api.getLead(id);
      
      // Basic Info
      setName(data.name || '');
      setPhone(data.phone || '');
      setEmail(data.email || '');
      
      // Lead Classification
      setLeadType(data.lead_type || 'seller');
      setLeadTemperature(data.lead_temperature || 'Hot');
      setLeadStatus(data.lead_status || '');
      
      // Property Details
      setLocation(data.location || '');
      setAddress(data.address || '');
      setPropertyType(data.property_type || '');
      setBhk(data.bhk || '');
      setFloor(data.floor || '');
      setAreaSize(data.area_size?.toString() || '');
      setFacing(data.building_facing || '');
      
      // Budget
      setBudgetMin(data.budget_min?.toString() || '');
      setBudgetMax(data.budget_max?.toString() || '');
      setUnit(data.unit || 'CR');
      
      // Other
      setParking(data.car_parking_number?.toString() || '');
      setLift(data.lift_available || '');
      setNotes(data.notes || '');
      setGoogleMapUrl(data.Property_locationUrl || '');
      setBuilderId(data.builder_id?.toString() || '');
      
      // Amenities
      setAmenities({
        park_facing: data.park_facing === 1 || data.park_facing === true,
        park_at_rear: data.park_at_rear === 1 || data.park_at_rear === true,
        wide_road: data.wide_road === 1 || data.wide_road === true,
        peaceful_location: data.peaceful_location === 1 || data.peaceful_location === true,
        main_road: data.main_road === 1 || data.main_road === true,
        corner: data.corner === 1 || data.corner === true,
      });
      
      // Load floor pricing if available
      if (data.floor_pricing && Array.isArray(data.floor_pricing)) {
        setFloorPrices(
          data.floor_pricing.map((fp: any) => ({
            floor: fp.floor_label || fp.floor || '',
            price: (fp.floor_amount || fp.price || '').toString()
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load lead:', error);
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentLocation = async () => {
    setFetchingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = currentLocation.coords;
      const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      setGoogleMapUrl(mapUrl);
      Alert.alert('Success', 'Current location captured!');
    } catch (error) {
      Alert.alert('Error', 'Failed to get current location.');
    } finally {
      setFetchingLocation(false);
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

  const toggleAmenity = (key: string) => {
    setAmenities(prev => ({
      ...prev,
      [key]: !prev[key as keyof typeof prev]
    }));
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
        area_size: areaSize || null,
        unit,
        car_parking_number: parking ? parseInt(parking) : null,
        lift_available: lift,
        notes: notes.trim(),
        Property_locationUrl: googleMapUrl.trim(),
        building_facing: facing,
        // Amenities
        park_facing: amenities.park_facing ? 1 : 0,
        park_at_rear: amenities.park_at_rear ? 1 : 0,
        wide_road: amenities.wide_road ? 1 : 0,
        peaceful_location: amenities.peaceful_location ? 1 : 0,
        main_road: amenities.main_road ? 1 : 0,
        corner: amenities.corner ? 1 : 0,
      };

      if (isInventory) {
        updateData.floor_pricing = floorPrices.filter(fp => fp.floor && fp.price);
        if (builderId) {
          updateData.builder_id = parseInt(builderId);
        }
      } else {
        updateData.budget_min = budgetMin ? parseFloat(budgetMin) : null;
        updateData.budget_max = budgetMax ? parseFloat(budgetMax) : null;
      }

      await api.updateLead(id!, updateData);
      Alert.alert('Success', 'Lead updated successfully', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err) {
      console.error('Update lead error:', err);
      Alert.alert('Error', 'Failed to update lead');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading lead details...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
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
          <FormInput
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Enter name"
            required
          />
          <FormInput
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter phone number"
            keyboardType="phone-pad"
          />
          <FormInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="Enter email"
            keyboardType="email-address"
          />
        </View>

        {/* Lead Classification */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lead Classification</Text>
          <CustomDropdown
            label="Lead Type"
            value={leadType}
            options={[...LEAD_TYPES]}
            onSelect={setLeadType}
            displayValue={leadType.charAt(0).toUpperCase() + leadType.slice(1)}
          />
          <CustomDropdown
            label="Temperature"
            value={leadTemperature}
            options={[...LEAD_TEMPERATURES]}
            onSelect={setLeadTemperature}
          />
          <CustomDropdown
            label="Status"
            value={leadStatus}
            options={isInventory ? [...INVENTORY_STATUSES] : [...CLIENT_STATUSES]}
            onSelect={setLeadStatus}
          />
        </View>

        {/* Property Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Property Details</Text>
          
          <CustomDropdown
            label="Location"
            value={location}
            options={[...LOCATIONS]}
            onSelect={setLocation}
            placeholder="Select Location"
          />

          <FormInput
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="Enter property address"
          />

          {isInventory && (
            <>
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
                    <ActivityIndicator size="small" color="#3B82F6" />
                  ) : (
                    <Ionicons name="location" size={22} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}

          <CustomDropdown
            label="Property Type"
            value={propertyType}
            options={[...PROPERTY_TYPES]}
            onSelect={setPropertyType}
            placeholder="Select Property Type"
          />

          <CustomDropdown
            label="BHK"
            value={bhk}
            options={[...BHK_OPTIONS]}
            onSelect={setBhk}
            placeholder="Select BHK"
          />

          <CustomDropdown
            label="Floor"
            value={floor}
            options={[...FLOORS]}
            onSelect={setFloor}
            placeholder="Select Floor"
          />

          <FormInput
            label="Area Size (sq.yds)"
            value={areaSize}
            onChangeText={setAreaSize}
            placeholder="Enter area"
            keyboardType="decimal-pad"
          />

          <CustomDropdown
            label="Facing"
            value={facing}
            options={[...FACINGS]}
            onSelect={setFacing}
            placeholder="Select Facing"
          />
        </View>

        {/* Budget/Pricing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isInventory ? 'Floor-wise Pricing' : 'Budget'}
          </Text>
          
          <CustomDropdown
            label="Unit"
            value={unit}
            options={[...UNITS]}
            onSelect={setUnit}
          />

          {isClient && (
            <View style={styles.budgetRow}>
              <View style={styles.budgetField}>
                <FormInput
                  label="Min Budget"
                  value={budgetMin}
                  onChangeText={setBudgetMin}
                  placeholder="Min"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.budgetField}>
                <FormInput
                  label="Max Budget"
                  value={budgetMax}
                  onChangeText={setBudgetMax}
                  placeholder="Max"
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          )}

          {isInventory && (
            <>
              {floorPrices.map((fp, index) => (
                <View key={index} style={styles.floorPriceRow}>
                  <View style={styles.floorPriceField}>
                    <CustomDropdown
                      label="Floor"
                      value={fp.floor}
                      options={[...FLOORS]}
                      onSelect={(v) => updateFloorPrice(index, 'floor', v)}
                      placeholder="Floor"
                    />
                  </View>
                  <View style={styles.floorPriceField}>
                    <FormInput
                      label="Price"
                      value={fp.price}
                      onChangeText={(v) => updateFloorPrice(index, 'price', v)}
                      placeholder="Price"
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.removeFloorBtn}
                    onPress={() => removeFloorPrice(index)}
                  >
                    <Ionicons name="close-circle" size={24} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addFloorBtn} onPress={addFloorPrice}>
                <Ionicons name="add-circle" size={20} color="#3B82F6" />
                <Text style={styles.addFloorText}>Add Floor Price</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Additional Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Details</Text>
          
          <FormInput
            label="Parking Spaces"
            value={parking}
            onChangeText={setParking}
            placeholder="Number of parking spaces"
            keyboardType="number-pad"
          />

          <RadioButtonGroup
            label="Lift Available"
            options={[...LIFT_OPTIONS]}
            selectedValue={lift}
            onSelect={setLift}
          />

          {isInventory && builders.length > 0 && (
            <CustomDropdown
              label="Builder"
              value={builderId}
              options={builders.map(b => b.id.toString())}
              onSelect={setBuilderId}
              placeholder="Select Builder (Optional)"
              displayValue={builders.find(b => b.id.toString() === builderId)?.builder_name || ''}
            />
          )}

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional notes..."
            placeholderTextColor="#9CA3AF"
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Amenities */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Amenities</Text>
          
          {AMENITIES.map((amenity) => (
            <View key={amenity.key} style={styles.amenityRow}>
              <Text style={styles.amenityLabel}>{amenity.label}</Text>
              <Switch
                value={amenities[amenity.key as keyof typeof amenities]}
                onValueChange={() => toggleAmenity(amenity.key)}
                trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                thumbColor={amenities[amenity.key as keyof typeof amenities] ? '#3B82F6' : '#F3F4F6'}
              />
            </View>
          ))}
        </View>

        <View style={styles.bottomSpacer} />
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
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
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
    paddingVertical: 8,
    borderRadius: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1F2937',
    minHeight: 48,
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  mapUrlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mapUrlInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1F2937',
    minHeight: 48,
  },
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  budgetRow: {
    flexDirection: 'row',
    gap: 12,
  },
  budgetField: {
    flex: 1,
  },
  floorPriceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 8,
  },
  floorPriceField: {
    flex: 1,
  },
  removeFloorBtn: {
    padding: 8,
    marginBottom: 8,
  },
  addFloorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 8,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addFloorText: {
    color: '#3B82F6',
    fontWeight: '500',
    marginLeft: 8,
  },
  amenityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  amenityLabel: {
    fontSize: 15,
    color: '#374151',
  },
  bottomSpacer: {
    height: 40,
  },
});
