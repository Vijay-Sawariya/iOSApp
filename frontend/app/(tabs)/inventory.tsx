import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineApi } from '../../services/offlineApi';
import { router, useFocusEffect } from 'expo-router';
import { useOffline } from '../../contexts/OfflineContext';

interface FloorPricing {
  floor_label: string;
  floor_amount: number;
}

interface PlotSpecification {
  total_builtup_sqft: number;
  per_floor_builtup_sqft: number;
}

interface CircleValue {
  floor: string;
  value: number;
}

interface Lead {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  lead_type: string | null;
  lead_temperature: string | null;
  lead_status: string | null;
  location: string | null;
  address: string | null;
  property_type: string | null;
  unit: string | null;
  area_size: string | null;
  budget_min: number | null;
  budget_max: number | null;
  floor: string | null;
  building_facing: string | null;
  floor_pricing?: FloorPricing[];
  created_at?: string | null;
  created_by_name?: string | null;
  Property_locationUrl?: string | null;
  plot_specifications?: PlotSpecification;
  circle_values?: CircleValue[];
  total_circle_value?: number;
}

// Filter Options
const LOCATIONS = [
  "Hauz Khas", "Sunder Nagar", "Shanti Niketan", "Panchsheel Park", "Panchsheel Enclave",
  "Defence Colony", "New Friends Colony", "Golf Links", "Anand Niketan", "Saket", "Shivalik",
  "Sarvapriya Vihar", "Chanakyapuri", "Lajpat Nagar", "Anand Lok", "CR Park", "East of Kailash",
  "Friends Colony", "Gulmohar Park", "Green Park", "Safdarjung Enclave", "SDA", "Malviya Nagar",
  "Vasant Kunj", "Jor Bagh", "Lodi Road", "Nizamuddin East", "Nizamuddin West", "Neeti Bagh",
  "Sarvodaya Enclave", "Kailash Colony", "Sukhdev Vihar", "West End", "Maharani Bagh"
];
const TYPES = [
  { label: 'All Types', value: '' },
  { label: 'For Sell', value: 'seller' },
  { label: 'For Rent', value: 'landlord' },
  { label: 'Builder', value: 'builder' },
];
const FLOORS = ['BMT', 'BMT+GF', 'GF', 'FF', 'SF', 'TF', 'TF+Terr'];
const STATUSES = ['Any', 'Under construction', 'Ready to move', 'Near Completion', 'Booking', 'Old', 'Sold'];
const FACINGS = ['Any', 'South', 'North', 'East', 'West', 'Southeast', 'Southwest', 'Northeast', 'Northwest'];

export default function InventoryLeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const { isOnline } = useOffline();

  // Filter states
  const [nameFilter, setNameFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [addressFilter, setAddressFilter] = useState('');
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [selectedFloors, setSelectedFloors] = useState<string[]>([]);
  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const [statusFilter, setStatusFilter] = useState('Any');
  const [areaMinFilter, setAreaMinFilter] = useState('');
  const [areaMaxFilter, setAreaMaxFilter] = useState('');
  const [budgetMinFilter, setBudgetMinFilter] = useState('');
  const [budgetMaxFilter, setBudgetMaxFilter] = useState('');
  const [facingFilter, setFacingFilter] = useState('Any');
  
  // Search states for modals
  const [locationSearch, setLocationSearch] = useState('');
  const [floorSearch, setFloorSearch] = useState('');

  // Filtered lists for modals
  const filteredLocations = LOCATIONS.filter(loc => 
    loc.toLowerCase().includes(locationSearch.toLowerCase())
  );
  const filteredFloors = FLOORS.filter(floor => 
    floor.toLowerCase().includes(floorSearch.toLowerCase())
  );

  const loadLeads = async () => {
    try {
      const data = await offlineApi.getInventoryLeads();
      setLeads(data);
      applyFilters(data);
    } catch (error) {
      console.error('Failed to load inventory leads:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadLeads();
    }, [])
  );

  const applyFilters = (data: Lead[] = leads) => {
    let filtered = [...data];

    // Name filter
    if (nameFilter.trim()) {
      filtered = filtered.filter(lead =>
        lead.name.toLowerCase().includes(nameFilter.toLowerCase())
      );
    }

    // Phone filter
    if (phoneFilter.trim()) {
      filtered = filtered.filter(lead =>
        lead.phone?.includes(phoneFilter)
      );
    }

    // Address filter
    if (addressFilter.trim()) {
      filtered = filtered.filter(lead =>
        lead.address?.toLowerCase().includes(addressFilter.toLowerCase())
      );
    }

    // Location filter (multi-select)
    if (selectedLocations.length > 0) {
      filtered = filtered.filter(lead =>
        selectedLocations.some(loc => lead.location?.toLowerCase().includes(loc.toLowerCase()))
      );
    }

    // Type filter
    if (typeFilter) {
      filtered = filtered.filter(lead => lead.lead_type === typeFilter);
    }

    // Floor filter - multiselect with space normalization
    if (selectedFloors.length > 0) {
      filtered = filtered.filter(lead => {
        if (!lead.floor) return false;
        const normalizedLeadFloor = lead.floor.replace(/\s+/g, '').toLowerCase();
        return selectedFloors.some(floor => {
          const normalizedFilter = floor.replace(/\s+/g, '').toLowerCase();
          return normalizedLeadFloor.includes(normalizedFilter);
        });
      });
    }

    // Status filter
    if (statusFilter && statusFilter !== 'Any') {
      filtered = filtered.filter(lead =>
        lead.lead_status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    // Area filter
    if (areaMinFilter || areaMaxFilter) {
      filtered = filtered.filter(lead => {
        const area = parseFloat(lead.area_size || '0');
        const min = areaMinFilter ? parseFloat(areaMinFilter) : 0;
        const max = areaMaxFilter ? parseFloat(areaMaxFilter) : Infinity;
        return area >= min && area <= max;
      });
    }

    // Budget filter
    if (budgetMinFilter || budgetMaxFilter) {
      filtered = filtered.filter(lead => {
        const budgetMin = lead.budget_min || 0;
        const budgetMax = lead.budget_max || 0;
        const filterMin = budgetMinFilter ? parseFloat(budgetMinFilter) : 0;
        const filterMax = budgetMaxFilter ? parseFloat(budgetMaxFilter) : Infinity;
        return budgetMax >= filterMin && budgetMin <= filterMax;
      });
    }

    // Facing filter
    if (facingFilter && facingFilter !== 'Any') {
      filtered = filtered.filter(lead =>
        lead.building_facing?.toLowerCase() === facingFilter.toLowerCase()
      );
    }

    setFilteredLeads(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeads();
    setRefreshing(false);
  };

  const handleSearch = () => {
    applyFilters();
    setShowFilters(false);
  };

  const handleReset = () => {
    setNameFilter('');
    setPhoneFilter('');
    setAddressFilter('');
    setSelectedLocations([]);
    setTypeFilter('');
    setSelectedFloors([]);
    setStatusFilter('Any');
    setAreaMinFilter('');
    setAreaMaxFilter('');
    setBudgetMinFilter('');
    setBudgetMaxFilter('');
    setFacingFilter('Any');
    setFilteredLeads(leads);
  };

  const toggleLocation = (loc: string) => {
    if (selectedLocations.includes(loc)) {
      setSelectedLocations(selectedLocations.filter(l => l !== loc));
    } else {
      setSelectedLocations([...selectedLocations, loc]);
    }
  };

  const toggleFloor = (floor: string) => {
    if (selectedFloors.includes(floor)) {
      setSelectedFloors(selectedFloors.filter(f => f !== floor));
    } else {
      setSelectedFloors([...selectedFloors, floor]);
    }
  };

  const hasActiveFilters = () => {
    return nameFilter || phoneFilter || addressFilter || selectedLocations.length > 0 ||
           typeFilter || selectedFloors.length > 0 || statusFilter !== 'Any' ||
           areaMinFilter || areaMaxFilter || budgetMinFilter || budgetMaxFilter ||
           facingFilter !== 'Any';
  };

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case 'seller': return { bg: '#DCFCE7', text: '#166534' };
      case 'landlord': return { bg: '#FEF3C7', text: '#92400E' };
      case 'builder': return { bg: '#E0E7FF', text: '#3730A3' };
      default: return { bg: '#F3F4F6', text: '#374151' };
    }
  };

  const getTemperatureColor = (temp: string | null) => {
    switch (temp?.toLowerCase()) {
      case 'hot': return '#EF4444';
      case 'warm': return '#F59E0B';
      case 'cold': return '#3B82F6';
      default: return '#9CA3AF';
    }
  };

  const formatUnit = (unit: string | null): string => {
    if (!unit) return '';
    switch (unit.toUpperCase()) {
      case 'CR':
        return ' Cr';
      case 'L':
        return ' L';
      case 'K':
      case 'TH':
        return ' K';
      default:
        return ` ${unit}`;
    }
  };

  const formatFloorPricing = (pricing?: FloorPricing[], unit?: string | null) => {
    if (!pricing || pricing.length === 0) return null;
    const unitStr = formatUnit(unit);
    return pricing.map(p => `${p.floor_label}: ₹${p.floor_amount}${unitStr}`).join(' | ');
  };

  const stats = {
    total: filteredLeads.length,
    sellers: filteredLeads.filter(l => l.lead_type === 'seller').length,
    landlords: filteredLeads.filter(l => l.lead_type === 'landlord').length,
    builders: filteredLeads.filter(l => l.lead_type === 'builder').length,
  };

  const openMapUrl = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open map URL:', err));
  };

  const renderLeadCard = ({ item }: { item: Lead }) => {
    const typeColor = getTypeColor(item.lead_type);
    const tempColor = getTemperatureColor(item.lead_temperature);
    const floorPricing = formatFloorPricing(item.floor_pricing, item.unit);
    const hasMapUrl = item.Property_locationUrl && item.Property_locationUrl.trim() !== '';

    // Format address and location display
    const addressLocation = [item.address, item.location].filter(Boolean).join(', ');

    return (
      <TouchableOpacity
        style={styles.leadCard}
        onPress={() => router.push(`/leads/${item.id}`)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <View style={styles.nameContainer}>
              <Text style={styles.leadName}>{item.name}</Text>
              {item.created_by_name && (
                <Text style={styles.createdByText}>Gen. By {item.created_by_name}</Text>
              )}
            </View>
            <View style={[styles.typeBadge, { backgroundColor: typeColor.bg }]}>
              <Text style={[styles.typeText, { color: typeColor.text }]}>
                {item.lead_type === 'seller' ? 'Sell' : item.lead_type === 'landlord' ? 'Rent' : 'Builder'}
              </Text>
            </View>
          </View>
          <View style={[styles.tempIndicator, { backgroundColor: tempColor }]} />
        </View>

        {item.phone && (
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={14} color="#6B7280" />
            <Text style={styles.infoText}>{item.phone}</Text>
          </View>
        )}

        {addressLocation && (
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            {hasMapUrl ? (
              <TouchableOpacity onPress={() => openMapUrl(item.Property_locationUrl!)}>
                <Text style={[styles.infoText, styles.mapLink]}>{addressLocation}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.infoText}>{addressLocation}</Text>
            )}
            {hasMapUrl && (
              <TouchableOpacity 
                style={styles.mapIconButton}
                onPress={() => openMapUrl(item.Property_locationUrl!)}
              >
                <Ionicons name="map" size={16} color="#3B82F6" />
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.propertyInfo}>
          {item.property_type && (
            <Text style={styles.propertyText}>{item.property_type}</Text>
          )}
          {item.area_size && (
            <Text style={styles.propertyText}>{item.area_size} sq.yds</Text>
          )}
          {item.lead_status && (
            <Text style={styles.statusText}>{item.lead_status}</Text>
          )}
        </View>

        {floorPricing && (
          <View style={styles.pricingRow}>
            <Ionicons name="cash-outline" size={14} color="#10B981" />
            <Text style={styles.pricingText} numberOfLines={1}>{floorPricing}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Seller/Landlord Inventories ({stats.total})</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.filterToggle, hasActiveFilters() && styles.filterToggleActive]}
            onPress={() => setShowFilters(true)}
          >
            <Ionicons name="filter" size={20} color={hasActiveFilters() ? '#FFFFFF' : '#374151'} />
            <Text style={[styles.filterToggleText, hasActiveFilters() && styles.filterToggleTextActive]}>
              Filters
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/leads/add')}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.sellers}</Text>
          <Text style={styles.statLabel}>Sellers</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.landlords}</Text>
          <Text style={styles.statLabel}>Landlords</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.builders}</Text>
          <Text style={styles.statLabel}>Builders</Text>
        </View>
      </View>

      {/* Leads List */}
      <FlatList
        data={filteredLeads}
        renderItem={renderLeadCard}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="file-tray-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No inventory found</Text>
            <Text style={styles.emptySubText}>Try adjusting your filters</Text>
          </View>
        }
      />

      {/* Filter Modal */}
      <Modal visible={showFilters} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.filterModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterContent} showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text style={styles.filterLabel}>Name (Lead/Builder)</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="Type name..."
                placeholderTextColor="#9CA3AF"
                value={nameFilter}
                onChangeText={setNameFilter}
              />

              {/* Phone & Address Row */}
              <View style={styles.filterRow}>
                <View style={styles.filterHalf}>
                  <Text style={styles.filterLabel}>Phone</Text>
                  <TextInput
                    style={styles.filterInput}
                    placeholder="Phone..."
                    placeholderTextColor="#9CA3AF"
                    value={phoneFilter}
                    onChangeText={setPhoneFilter}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.filterHalf}>
                  <Text style={styles.filterLabel}>Address</Text>
                  <TextInput
                    style={styles.filterInput}
                    placeholder="Address..."
                    placeholderTextColor="#9CA3AF"
                    value={addressFilter}
                    onChangeText={setAddressFilter}
                  />
                </View>
              </View>

              {/* Locations */}
              <Text style={styles.filterLabel}>Locations</Text>
              <TouchableOpacity
                style={styles.locationSelector}
                onPress={() => setShowLocationPicker(true)}
              >
                <Text style={[styles.locationText, selectedLocations.length === 0 && styles.placeholderText]}>
                  {selectedLocations.length > 0 
                    ? `${selectedLocations.length} selected` 
                    : 'Select locations'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#6B7280" />
              </TouchableOpacity>
              {selectedLocations.length > 0 && (
                <View style={styles.selectedTags}>
                  {selectedLocations.map(loc => (
                    <TouchableOpacity
                      key={loc}
                      style={styles.selectedTag}
                      onPress={() => toggleLocation(loc)}
                    >
                      <Text style={styles.selectedTagText}>{loc}</Text>
                      <Ionicons name="close" size={14} color="#6B7280" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Type & Floor Row */}
              <View style={styles.filterRow}>
                <View style={styles.filterHalf}>
                  <Text style={styles.filterLabel}>Type</Text>
                  <View style={styles.pickerContainer}>
                    {TYPES.map(t => (
                      <TouchableOpacity
                        key={t.value}
                        style={[styles.pickerOption, typeFilter === t.value && styles.pickerOptionActive]}
                        onPress={() => setTypeFilter(t.value)}
                      >
                        <Text style={[styles.pickerOptionText, typeFilter === t.value && styles.pickerOptionTextActive]}>
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.filterHalf}>
                  <Text style={styles.filterLabel}>Floor</Text>
                  <TouchableOpacity
                    style={styles.locationSelector}
                    onPress={() => setShowFloorPicker(true)}
                  >
                    <Text style={[styles.locationText, selectedFloors.length === 0 && styles.placeholderText]}>
                      {selectedFloors.length > 0 
                        ? `${selectedFloors.length} selected` 
                        : 'Select floors'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Selected Floors Tags */}
              {selectedFloors.length > 0 && (
                <View style={styles.selectedTags}>
                  {selectedFloors.map(floor => (
                    <TouchableOpacity
                      key={floor}
                      style={styles.selectedTag}
                      onPress={() => toggleFloor(floor)}
                    >
                      <Text style={styles.selectedTagText}>{floor}</Text>
                      <Ionicons name="close" size={14} color="#6B7280" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Status */}
              <Text style={styles.filterLabel}>Status</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
                {STATUSES.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.statusOption, statusFilter === s && styles.statusOptionActive]}
                    onPress={() => setStatusFilter(s)}
                  >
                    <Text style={[styles.statusOptionText, statusFilter === s && styles.statusOptionTextActive]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Area Range */}
              <Text style={styles.filterLabel}>Area (Sq Yds)</Text>
              <View style={styles.filterRow}>
                <View style={styles.filterHalf}>
                  <TextInput
                    style={styles.filterInput}
                    placeholder="Min"
                    placeholderTextColor="#9CA3AF"
                    value={areaMinFilter}
                    onChangeText={setAreaMinFilter}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.rangeSeparator}>to</Text>
                <View style={styles.filterHalf}>
                  <TextInput
                    style={styles.filterInput}
                    placeholder="Max"
                    placeholderTextColor="#9CA3AF"
                    value={areaMaxFilter}
                    onChangeText={setAreaMaxFilter}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Budget Range */}
              <Text style={styles.filterLabel}>Budget (CR)</Text>
              <View style={styles.filterRow}>
                <View style={styles.filterHalf}>
                  <TextInput
                    style={styles.filterInput}
                    placeholder="Min"
                    placeholderTextColor="#9CA3AF"
                    value={budgetMinFilter}
                    onChangeText={setBudgetMinFilter}
                    keyboardType="numeric"
                  />
                </View>
                <Text style={styles.rangeSeparator}>to</Text>
                <View style={styles.filterHalf}>
                  <TextInput
                    style={styles.filterInput}
                    placeholder="Max"
                    placeholderTextColor="#9CA3AF"
                    value={budgetMaxFilter}
                    onChangeText={setBudgetMaxFilter}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Facing */}
              <Text style={styles.filterLabel}>Facing</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalPicker}>
                {FACINGS.map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.statusOption, facingFilter === f && styles.statusOptionActive]}
                    onPress={() => setFacingFilter(f)}
                  >
                    <Text style={[styles.statusOptionText, facingFilter === f && styles.statusOptionTextActive]}>
                      {f}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.filterSpacer} />
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                <Text style={styles.resetButtonText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
                <Text style={styles.searchButtonText}>Search</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Location Picker Modal */}
      <Modal visible={showLocationPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.locationModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Locations</Text>
              <TouchableOpacity onPress={() => {
                setShowLocationPicker(false);
                setLocationSearch('');
              }}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.modalSearchInput}
                value={locationSearch}
                onChangeText={setLocationSearch}
                placeholder="Type to search locations..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              {locationSearch.length > 0 && (
                <TouchableOpacity onPress={() => setLocationSearch('')}>
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredLocations}
              keyExtractor={(item) => item}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
              getItemLayout={(data, index) => ({
                length: 52,
                offset: 52 * index,
                index,
              })}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.locationItem}
                  onPress={() => toggleLocation(item)}
                >
                  <Text style={styles.locationItemText}>{item}</Text>
                  {selectedLocations.includes(item) && (
                    <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.locationList}
              ListEmptyComponent={
                <View style={styles.emptySearchResult}>
                  <Text style={styles.emptySearchText}>No locations found</Text>
                </View>
              }
            />
            <TouchableOpacity
              style={styles.locationDoneButton}
              onPress={() => {
                setShowLocationPicker(false);
                setLocationSearch('');
              }}
            >
              <Text style={styles.locationDoneText}>Done ({selectedLocations.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Floor Picker Modal */}
      <Modal visible={showFloorPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.locationModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Floors</Text>
              <TouchableOpacity onPress={() => {
                setShowFloorPicker(false);
                setFloorSearch('');
              }}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.modalSearchInput}
                value={floorSearch}
                onChangeText={setFloorSearch}
                placeholder="Type to search floors..."
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
              />
              {floorSearch.length > 0 && (
                <TouchableOpacity onPress={() => setFloorSearch('')}>
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
            <FlatList
              data={filteredFloors}
              keyExtractor={(item) => item}
              initialNumToRender={10}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.locationItem}
                  onPress={() => toggleFloor(item)}
                >
                  <Text style={styles.locationItemText}>{item}</Text>
                  {selectedFloors.includes(item) && (
                    <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.locationList}
              ListEmptyComponent={
                <View style={styles.emptySearchResult}>
                  <Text style={styles.emptySearchText}>No floors found</Text>
                </View>
              }
            />
            <TouchableOpacity
              style={styles.locationDoneButton}
              onPress={() => {
                setShowFloorPicker(false);
                setFloorSearch('');
              }}
            >
              <Text style={styles.locationDoneText}>Done ({selectedFloors.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  filterToggleActive: {
    backgroundColor: '#1F2937',
    borderColor: '#1F2937',
  },
  filterToggleText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginLeft: 4,
  },
  filterToggleTextActive: {
    color: '#FFFFFF',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  leadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  leadName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tempIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
    flex: 1,
  },
  mapLink: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  mapIconButton: {
    marginLeft: 8,
    padding: 4,
  },
  nameContainer: {
    flex: 1,
  },
  createdByText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 2,
  },
  propertyInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  propertyText: {
    fontSize: 12,
    color: '#374151',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  statusText: {
    fontSize: 12,
    color: '#059669',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  pricingText: {
    fontSize: 12,
    color: '#10B981',
    marginLeft: 6,
    flex: 1,
  },
  specSection: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  specTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 6,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  specItem: {
    flex: 1,
  },
  specLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginBottom: 2,
  },
  specValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369A1',
  },
  circleValueSection: {
    backgroundColor: '#F5F3FF',
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  circleValueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  circleValueTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6D28D9',
    marginLeft: 6,
  },
  circleValueTotal: {
    fontSize: 14,
    fontWeight: '700',
    color: '#7C3AED',
    marginLeft: 'auto',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptySubText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  filterModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
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
  filterContent: {
    padding: 16,
    maxHeight: 500,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  filterInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#1F2937',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  filterHalf: {
    flex: 1,
    marginRight: 8,
  },
  rangeSeparator: {
    fontSize: 14,
    color: '#6B7280',
    marginHorizontal: 8,
    marginBottom: 14,
  },
  locationSelector: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  locationText: {
    fontSize: 14,
    color: '#1F2937',
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  selectedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    marginBottom: 6,
  },
  selectedTagText: {
    fontSize: 12,
    color: '#3730A3',
    marginRight: 4,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pickerOption: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    marginRight: 6,
    marginBottom: 6,
  },
  pickerOptionActive: {
    backgroundColor: '#1F2937',
  },
  pickerOptionText: {
    fontSize: 12,
    color: '#374151',
  },
  pickerOptionTextActive: {
    color: '#FFFFFF',
  },
  horizontalPicker: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  statusOption: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  statusOptionActive: {
    backgroundColor: '#1F2937',
  },
  statusOptionText: {
    fontSize: 12,
    color: '#374151',
  },
  statusOptionTextActive: {
    color: '#FFFFFF',
  },
  filterSpacer: {
    height: 20,
  },
  filterActions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  resetButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginRight: 8,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  searchButton: {
    flex: 2,
    backgroundColor: '#1F2937',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  searchButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Location Modal
  locationModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 300,
  },
  locationList: {
    flexGrow: 1,
  },
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  locationItemText: {
    fontSize: 15,
    color: '#1F2937',
  },
  locationDoneButton: {
    backgroundColor: '#1F2937',
    margin: 16,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  locationDoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Search styles for modals
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  modalSearchInput: {
    flex: 1,
    height: 44,
    marginLeft: 10,
    fontSize: 15,
    color: '#1F2937',
  },
  emptySearchResult: {
    padding: 40,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
});
