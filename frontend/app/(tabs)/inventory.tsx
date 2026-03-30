import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineApi } from '../../services/offlineApi';
import { router, useFocusEffect } from 'expo-router';
import { useOffline } from '../../contexts/OfflineContext';
import { SafeAreaView } from 'react-native-safe-area-context';

// Import shared components
import {
  FilterChip,
  StatsBar,
  SearchablePickerModal,
  FilterSection,
  TextFilterInput,
  RangeFilterInput,
  MultiSelectButton,
  SelectedTags,
} from '../../components/filters/FilterComponents';

// Import shared constants and helpers
import {
  Lead,
  FloorPricing,
  getTypeColor,
  getTemperatureColor,
  formatFloorPricing,
  normalizeSearchText,
  LOCATIONS,
  FLOORS,
  INVENTORY_STATUSES,
  FACINGS,
} from '../../constants/leadOptions';

// Type filter options (specific to this screen)
const TYPES = [
  { label: 'All Types', value: '' },
  { label: 'For Sell', value: 'seller' },
  { label: 'For Rent', value: 'landlord' },
  { label: 'Builder', value: 'builder' },
];
const STATUSES = ['Any', ...INVENTORY_STATUSES];
const FACING_OPTIONS = ['Any', ...FACINGS];

// Use constants from shared file
const LOCATION_OPTIONS = [...LOCATIONS];
const FLOOR_OPTIONS = [...FLOORS];

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

  // Memoized filtered lists for modals - prevents re-computation on every render
  const filteredLocations = useMemo(() => 
    LOCATION_OPTIONS.filter(loc => 
      loc.toLowerCase().includes(locationSearch.toLowerCase())
    ), [locationSearch]
  );
  
  const filteredFloors = useMemo(() => 
    FLOOR_OPTIONS.filter(floor => 
      floor.toLowerCase().includes(floorSearch.toLowerCase())
    ), [floorSearch]
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

    // Address filter - with normalization for flexible matching
    // "F18", "F 18", "F-18", "F- 18", "F -18" all match
    if (addressFilter.trim()) {
      const normalizedSearch = normalizeSearchText(addressFilter);
      filtered = filtered.filter(lead => {
        const normalizedAddress = normalizeSearchText(lead.address || '');
        return normalizedAddress.includes(normalizedSearch);
      });
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

  const stats = useMemo(() => ({
    total: leads.length,
    sellers: leads.filter(l => l.lead_type === 'seller').length,
    landlords: leads.filter(l => l.lead_type === 'landlord').length,
    builders: leads.filter(l => l.lead_type === 'builder').length,
    agents: leads.filter(l => l.lead_type === 'agent').length,
  }), [leads]);

  const openMapUrl = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open map URL:', err));
  };

  const handleDelete = (id: number, name: string) => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot delete while offline.');
      return;
    }
    Alert.alert('Delete Lead', `Are you sure you want to delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await offlineApi.deleteLead(String(id));
            loadLeads();
            Alert.alert('Success', 'Lead deleted successfully');
          } catch (error) {
            Alert.alert('Error', 'Failed to delete lead');
          }
        },
      },
    ]);
  };

  const handleAddReminder = (item: Lead) => {
    router.push({
      pathname: '/reminders/add',
      params: { lead_id: item.id, lead_name: item.name }
    } as any);
  };

  const renderLeadCard = ({ item }: { item: Lead }) => {
    const typeColor = getTypeColor(item.lead_type);
    const isHot = item.lead_temperature === 'Hot';
    const floorPricing = formatFloorPricing(item.floor_pricing, item.unit);
    const hasMapUrl = item.Property_locationUrl && item.Property_locationUrl.trim() !== '';

    // Get lead type display
    const getLeadTypeDisplay = (type: string | null) => {
      switch (type) {
        case 'seller': return 'Sell';
        case 'landlord': return 'Rent';
        case 'builder': return 'Builder';
        case 'agent': return 'Agent';
        default: return type || 'N/A';
      }
    };

    return (
      <View style={styles.leadCard}>
        {/* Main content - tappable to view details */}
        <TouchableOpacity
          style={styles.leadContent}
          onPress={() => router.push(`/leads/${item.id}`)}
          activeOpacity={0.7}
        >
          {/* Name and Type Badge Row */}
          <View style={styles.cardHeader}>
            <View style={styles.nameSection}>
              <Text style={styles.leadName}>{item.name}</Text>
              {item.created_by_name && (
                <Text style={styles.createdByText}>Gen. By {item.created_by_name}</Text>
              )}
            </View>
            <View style={styles.typeBadgeContainer}>
              <View style={[styles.typeBadge, { backgroundColor: typeColor.bg }]}>
                <Text style={[styles.typeBadgeText, { color: typeColor.text }]}>
                  {getLeadTypeDisplay(item.lead_type)}
                </Text>
              </View>
              {isHot && <View style={styles.hotDot} />}
            </View>
          </View>

          {/* Phone Row */}
          {item.phone && (
            <View style={styles.infoRow}>
              <Ionicons name="call" size={14} color="#6B7280" />
              <Text style={styles.infoText}>{item.phone}</Text>
            </View>
          )}

          {/* Location Row */}
          {item.location && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={14} color="#6B7280" />
              <Text style={styles.infoText} numberOfLines={2}>{item.location}</Text>
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

          {/* Tags Row */}
          <View style={styles.tagsRow}>
            {item.property_type && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.property_type}</Text>
              </View>
            )}
            {item.bhk && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.bhk}</Text>
              </View>
            )}
            {item.area_size && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.area_size} sq.yds</Text>
              </View>
            )}
            {item.lead_status && (
              <View style={[styles.tag, styles.statusTag]}>
                <Text style={[styles.tagText, styles.statusTagText]}>{item.lead_status}</Text>
              </View>
            )}
          </View>

          {/* Amenities Row */}
          {(item as any).required_amenities && (
            <Text style={styles.amenitiesText} numberOfLines={1}>
              {(item as any).required_amenities}
            </Text>
          )}

          {/* Floor Pricing Row */}
          {floorPricing && (
            <View style={styles.budgetRow}>
              <Ionicons name="eye" size={16} color="#10B981" />
              <Text style={styles.budgetText}>{floorPricing}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Action Buttons Row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleAddReminder(item)}
          >
            <Ionicons name="alarm-outline" size={18} color="#F59E0B" />
            <Text style={[styles.actionText, { color: '#F59E0B' }]}>Reminder</Text>
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/leads/edit/${item.id}` as any)}
          >
            <Ionicons name="create-outline" size={18} color="#3B82F6" />
            <Text style={[styles.actionText, { color: '#3B82F6' }]}>Edit</Text>
          </TouchableOpacity>
          <View style={styles.actionDivider} />
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(item.id, item.name)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Blue Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.blueHeader}>
          <Text style={styles.headerTitle}>Inventories</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerIconBtn}
              onPress={() => setShowFilters(true)}
            >
              <Ionicons 
                name="options-outline" 
                size={22} 
                color={hasActiveFilters() ? '#FFD700' : '#FFFFFF'} 
              />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.headerAddBtn}
              onPress={() => router.push('/leads/add?type=inventory' as any)}
            >
              <Ionicons name="add" size={24} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* White Content Area */}
      <View style={styles.contentArea}>
        {/* Stats Bar - Same style as Clients */}
        <View style={styles.statsBar}>
          <View style={[styles.statItem, styles.statItemActive]}>
            <Text style={[styles.statNumber, styles.statNumberActive]}>{stats.total}</Text>
            <Text style={[styles.statLabel, styles.statLabelActive]}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.sellers}</Text>
            <Text style={styles.statLabel}>Sellers</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.landlords}</Text>
            <Text style={styles.statLabel}>Landlords</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.builders}</Text>
            <Text style={styles.statLabel}>Builders</Text>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search inventories..."
            placeholderTextColor="#9CA3AF"
            value={nameFilter}
            onChangeText={(text) => {
              setNameFilter(text);
              // Auto apply name filter
              let filtered = [...leads];
              if (text.trim()) {
                filtered = filtered.filter(lead =>
                  lead.name.toLowerCase().includes(text.toLowerCase()) ||
                  lead.phone?.includes(text) ||
                  lead.address?.toLowerCase().includes(text.toLowerCase())
                );
              }
              setFilteredLeads(filtered);
            }}
          />
          {nameFilter.length > 0 && (
            <TouchableOpacity onPress={() => {
              setNameFilter('');
              setFilteredLeads(leads);
            }}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
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
      </View>

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

              {/* Type */}
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
                {FACING_OPTIONS.map(f => (
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

      {/* FAB - Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/leads/add?type=inventory' as any)}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3B82F6',
  },
  headerSafeArea: {
    backgroundColor: '#3B82F6',
  },
  blueHeader: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  statItemActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
  },
  statNumberActive: {
    color: '#3B82F6',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  statLabelActive: {
    color: '#3B82F6',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 48,
  },
  searchInput: {
    flex: 1,
    height: 48,
    marginLeft: 12,
    fontSize: 16,
    color: '#1F2937',
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
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  leadContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  nameSection: {
    flex: 1,
    marginRight: 12,
  },
  leadName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  createdByText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  typeBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  hotDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    marginLeft: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
    marginLeft: 8,
    flex: 1,
  },
  mapIconButton: {
    marginLeft: 8,
    padding: 4,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  tag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  statusTag: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  statusTagText: {
    color: '#16A34A',
  },
  amenitiesText: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  budgetText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  actionDivider: {
    width: 1,
    backgroundColor: '#F3F4F6',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
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
  // Action buttons and FAB styles
  actionsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginLeft: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
