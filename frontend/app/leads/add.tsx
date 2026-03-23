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

const PROPERTY_STATUS = ["Under construction", "Ready to move", "Near Completion", "Booking", "Old", "Sold"];
const PROPERTY_TYPES = ["Apartment", "Builder", "Plot", "Vila"];
const FLOORS = ["BMT", "BMT+GF", "GF", "FF", "SF", "TF", "TF+Terr"];
const FACING = ["South", "North", "East", "West", "Southeast", "Southwest", "Northeast", "Northwest"];
const AMENITIES = ["Park Facing", "Park at Rear", "Wide Road", "Main Road", "Peaceful Location", "Corner", "T-Point", "Adjacent Park"];

export default function AddLeadScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [leadType, setLeadType] = useState('buyer');
  const [location, setLocation] = useState('');
  const [address, setAddress] = useState('');
  const [leadTemperature, setLeadTemperature] = useState('Hot');
  const [leadStatus, setLeadStatus] = useState('New');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Client (Buyer/Tenant) fields
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [clientFacing, setClientFacing] = useState('');
  const [clientAmenities, setClientAmenities] = useState<string[]>([]);
  
  // Inventory fields
  const [builders, setBuilders] = useState<any[]>([]);
  const [builderId, setBuilderId] = useState('');
  const [propertyStatus, setPropertyStatus] = useState('');
  const [googleMapUrl, setGoogleMapUrl] = useState('');
  const [propertyType, setPropertyType] = useState('');
  const [bhk, setBhk] = useState('');
  const [possessionMonth, setPossessionMonth] = useState('');
  const [possessionYear, setPossessionYear] = useState('');
  const [areaSize, setAreaSize] = useState('');
  const [selectedFloors, setSelectedFloors] = useState<string[]>([]);
  const [floorPricing, setFloorPricing] = useState<{[key: string]: string}>({});
  const [parking, setParking] = useState('');
  const [lift, setLift] = useState('');
  const [facing, setFacing] = useState('');
  const [inventoryAmenities, setInventoryAmenities] = useState<string[]>([]);

  useEffect(() => {
    loadBuilders();
  }, []);

  const loadBuilders = async () => {
    try {
      const data = await api.getBuilders();
      setBuilders(data);
    } catch (error) {
      console.error('Failed to load builders:', error);
    }
  };

  const isInventoryLead = () => ['seller', 'landlord', 'builder'].includes(leadType);
  const isClientLead = () => ['buyer', 'tenant'].includes(leadType);

  const handleSubmit = async () => {
    if (!name || !leadType) {
      Alert.alert('Error', 'Please enter lead name and select type');
      return;
    }

    setLoading(true);
    try {
      const leadData: any = {
        name,
        phone: phone || null,
        email: email || null,
        lead_type: leadType,
        location: location || null,
        address: address || null,
        lead_temperature: leadTemperature,
        lead_status: leadStatus,
        notes: notes || null,
      };

      if (isClientLead()) {
        leadData.budget_min = budgetMin ? parseFloat(budgetMin) : null;
        leadData.budget_max = budgetMax ? parseFloat(budgetMax) : null;
        if (clientFacing) leadData.notes = `${notes || ''}\nFacing: ${clientFacing}\nAmenities: ${clientAmenities.join(', ')}`.trim();
      }

      if (isInventoryLead()) {
        leadData.builder_id = builderId ? parseInt(builderId) : null;
        leadData.property_type = propertyType || null;
        leadData.bhk = bhk || null;
        
        const inventoryNotes = [
          notes,
          propertyStatus && `Status: ${propertyStatus}`,
          googleMapUrl && `Map: ${googleMapUrl}`,
          possessionMonth && possessionYear && `Possession: ${possessionMonth}/${possessionYear}`,
          areaSize && `Area: ${areaSize} sq ft`,
          selectedFloors.length > 0 && `Floors: ${selectedFloors.join(', ')}`,
          parking && `Parking: ${parking}`,
          lift && `Lift: ${lift}`,
          facing && `Facing: ${facing}`,
          Object.keys(floorPricing).length > 0 && `Floor Pricing: ${Object.entries(floorPricing).map(([f, p]) => `${f}: ₹${p}`).join(', ')}`,
          inventoryAmenities.length > 0 && `Amenities: ${inventoryAmenities.join(', ')}`,
        ].filter(Boolean).join('\n');
        
        leadData.notes = inventoryNotes;
      }

      await api.createLead(leadData);
      Alert.alert('Success', 'Lead created successfully');
      router.back();
    } catch (error) {
      console.error('Error creating lead:', error);
      Alert.alert('Error', 'Failed to create lead');
    } finally {
      setLoading(false);
    }
  };

  const toggleAmenity = (amenity: string, isClient: boolean) => {
    if (isClient) {
      if (clientAmenities.includes(amenity)) {
        setClientAmenities(clientAmenities.filter(a => a !== amenity));
      } else {
        setClientAmenities([...clientAmenities, amenity]);
      }
    } else {
      if (inventoryAmenities.includes(amenity)) {
        setInventoryAmenities(inventoryAmenities.filter(a => a !== amenity));
      } else {
        setInventoryAmenities([...inventoryAmenities, amenity]);
      }
    }
  };

  const toggleFloor = (floor: string) => {
    if (selectedFloors.includes(floor)) {
      setSelectedFloors(selectedFloors.filter(f => f !== floor));
      // Remove pricing for unselected floor
      const newPricing = {...floorPricing};
      delete newPricing[floor];
      setFloorPricing(newPricing);
    } else {
      setSelectedFloors([...selectedFloors, floor]);
    }
  };

  const updateFloorPrice = (floor: string, price: string) => {
    setFloorPricing({...floorPricing, [floor]: price});
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
              placeholderTextColor="#9CA3AF"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Enter phone number"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email (Optional)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter email"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Lead Type *</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={leadType}
                onValueChange={setLeadType}
                style={styles.picker}
                itemStyle={styles.pickerItem}
              >
                <Picker.Item label="Buyer (Client)" value="buyer" color="#000000" />
                <Picker.Item label="Tenant (Client)" value="tenant" color="#000000" />
                <Picker.Item label="Seller (Inventory)" value="seller" color="#000000" />
                <Picker.Item label="Landlord (Inventory)" value="landlord" color="#000000" />
                <Picker.Item label="Builder (Inventory)" value="builder" color="#000000" />
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Lead Temperature</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={leadTemperature}
                onValueChange={setLeadTemperature}
                style={styles.picker}
              >
                <Picker.Item label="Hot" value="Hot" color="#000000" />
                <Picker.Item label="Warm" value="Warm" color="#000000" />
                <Picker.Item label="Cold" value="Cold" color="#000000" />
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
              placeholderTextColor="#9CA3AF"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Location</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={location}
                onValueChange={setLocation}
                style={styles.picker}
              >
                <Picker.Item label="Select Location" value="" color="#9CA3AF" />
                {LOCATIONS.map((loc) => (
                  <Picker.Item key={loc} label={loc} value={loc} color="#000000" />
                ))}
              </Picker>
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Address</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={address}
              onChangeText={setAddress}
              placeholder="Enter full address"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
            />
          </View>
        </View>

        {/* Client-specific fields */}
        {isClientLead() && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Client Requirements</Text>

            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.halfWidth]}>
                <Text style={styles.label}>Min Budget (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={budgetMin}
                  onChangeText={setBudgetMin}
                  placeholder="Min"
                  placeholderTextColor="#9CA3AF"
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
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Facing</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={clientFacing}
                  onValueChange={setClientFacing}
                  style={styles.picker}
                >
                  <Picker.Item label="Select Facing" value="" color="#9CA3AF" />
                  {FACING.map((f) => (
                    <Picker.Item key={f} label={f} value={f} color="#000000" />
                  ))}
                </Picker>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Additional Amenities</Text>
              <View style={styles.amenitiesContainer}>
                {AMENITIES.map((amenity) => (
                  <TouchableOpacity
                    key={amenity}
                    style={[
                      styles.amenityChip,
                      clientAmenities.includes(amenity) && styles.amenityChipSelected,
                    ]}
                    onPress={() => toggleAmenity(amenity, true)}
                  >
                    <Text
                      style={[
                        styles.amenityChipText,
                        clientAmenities.includes(amenity) && styles.amenityChipTextSelected,
                      ]}
                    >
                      {amenity}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Inventory-specific fields */}
        {isInventoryLead() && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Property Details</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Builder</Text>
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={builderId}
                    onValueChange={setBuilderId}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select Builder" value="" color="#9CA3AF" />
                    {builders.map((builder) => (
                      <Picker.Item
                        key={builder.id}
                        label={builder.builder_name}
                        value={builder.id.toString()}
                        color="#000000"
                      />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Property Status</Text>
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={propertyStatus}
                    onValueChange={setPropertyStatus}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select Status" value="" color="#9CA3AF" />
                    {PROPERTY_STATUS.map((status) => (
                      <Picker.Item key={status} label={status} value={status} color="#000000" />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Property Type</Text>
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={propertyType}
                    onValueChange={setPropertyType}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select Type" value="" color="#9CA3AF" />
                    {PROPERTY_TYPES.map((type) => (
                      <Picker.Item key={type} label={type} value={type} color="#000000" />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>BHK</Text>
                <TextInput
                  style={styles.input}
                  value={bhk}
                  onChangeText={setBhk}
                  placeholder="e.g., 2 BHK, 3 BHK"
                  placeholderTextColor="#9CA3AF"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Google Map URL</Text>
                <TextInput
                  style={styles.input}
                  value={googleMapUrl}
                  onChangeText={setGoogleMapUrl}
                  placeholder="Enter Google Maps link"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.row}>
                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={styles.label}>Possession Month</Text>
                  <TextInput
                    style={styles.input}
                    value={possessionMonth}
                    onChangeText={setPossessionMonth}
                    placeholder="MM"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    maxLength={2}
                  />
                </View>

                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={styles.label}>Possession Year</Text>
                  <TextInput
                    style={styles.input}
                    value={possessionYear}
                    onChangeText={setPossessionYear}
                    placeholder="YYYY"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                    maxLength={4}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Area Size (sq ft)</Text>
                <TextInput
                  style={styles.input}
                  value={areaSize}
                  onChangeText={setAreaSize}
                  placeholder="Enter area in sq ft"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Floor (Select Multiple)</Text>
                <View style={styles.amenitiesContainer}>
                  {FLOORS.map((floorOption) => (
                    <TouchableOpacity
                      key={floorOption}
                      style={[
                        styles.amenityChip,
                        selectedFloors.includes(floorOption) && styles.amenityChipSelected,
                      ]}
                      onPress={() => toggleFloor(floorOption)}
                    >
                      <Text
                        style={[
                          styles.amenityChipText,
                          selectedFloors.includes(floorOption) && styles.amenityChipTextSelected,
                        ]}
                      >
                        {floorOption}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Floor-wise Pricing */}
              {selectedFloors.length > 0 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Floor-wise Pricing</Text>
                  {selectedFloors.map((floor) => (
                    <View key={floor} style={styles.floorPricingRow}>
                      <View style={styles.floorLabel}>
                        <Text style={styles.floorLabelText}>{floor}</Text>
                      </View>
                      <TextInput
                        style={styles.floorPriceInput}
                        value={floorPricing[floor] || ''}
                        onChangeText={(text) => updateFloorPrice(floor, text)}
                        placeholder="Amount (₹)"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="numeric"
                      />
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.row}>
                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={styles.label}>Parking (Number)</Text>
                  <TextInput
                    style={styles.input}
                    value={parking}
                    onChangeText={setParking}
                    placeholder="Number of spaces"
                    placeholderTextColor="#9CA3AF"
                    keyboardType="numeric"
                  />
                </View>

                <View style={[styles.inputGroup, styles.halfWidth]}>
                  <Text style={styles.label}>Lift</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={lift}
                      onValueChange={setLift}
                      style={styles.picker}
                    >
                      <Picker.Item label="Select" value="" color="#9CA3AF" />
                      <Picker.Item label="Yes" value="Yes" color="#000000" />
                      <Picker.Item label="No" value="No" color="#000000" />
                    </Picker>
                  </View>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Facing</Text>
                <View style={styles.pickerWrapper}>
                  <Picker
                    selectedValue={facing}
                    onValueChange={setFacing}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select Facing" value="" color="#9CA3AF" />
                    {FACING.map((f) => (
                      <Picker.Item key={f} label={f} value={f} color="#000000" />
                    ))}
                  </Picker>
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Additional Amenities</Text>
                <View style={styles.amenitiesContainer}>
                  {AMENITIES.map((amenity) => (
                    <TouchableOpacity
                      key={amenity}
                      style={[
                        styles.amenityChip,
                        inventoryAmenities.includes(amenity) && styles.amenityChipSelected,
                      ]}
                      onPress={() => toggleAmenity(amenity, false)}
                    >
                      <Text
                        style={[
                          styles.amenityChipText,
                          inventoryAmenities.includes(amenity) && styles.amenityChipTextSelected,
                        ]}
                      >
                        {amenity}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Notes</Text>

          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Add any notes or comments..."
              placeholderTextColor="#9CA3AF"
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
  pickerWrapper: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    color: '#1F2937',
  },
  pickerItem: {
    fontSize: 16,
    color: '#1F2937',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  amenitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  amenityChip: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  amenityChipSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  amenityChipText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  amenityChipTextSelected: {
    color: '#FFFFFF',
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
  floorPricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  floorLabel: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 100,
  },
  floorLabelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
    textAlign: 'center',
  },
  floorPriceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#FFFFFF',
  },
});
