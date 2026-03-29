import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineApi } from '../../services/offlineApi';
import { router, useFocusEffect } from 'expo-router';
import { useOffline } from '../../contexts/OfflineContext';
import { LOCATIONS, FLOORS, normalizeSearchText } from '../../constants/leadOptions';

interface Lead {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  lead_type: string | null;
  lead_temperature: string | null;
  lead_status: string | null;
  location: string | null;
  floor: string | null;
  area_size: string | null;
  budget_min: number | null;
  budget_max: number | null;
  unit: string | null;
  address: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
}

// Filter arrays
const LOCATION_OPTIONS = [...LOCATIONS];
const FLOOR_OPTIONS = [...FLOORS];

export default function ClientLeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [temperatureFilter, setTemperatureFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'date' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const { isOnline } = useOffline();
  
  // Location/Floor filter states
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedFloors, setSelectedFloors] = useState<string[]>([]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [floorSearch, setFloorSearch] = useState('');

  // Memoized filtered lists for modals
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
      const data = await offlineApi.getClientLeads();
      setLeads(data);
      applyFilters(data, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors);
    } catch (error) {
      console.error('Failed to load client leads:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadLeads();
    }, [])
  );

  const applyFilters = (
    data: Lead[], 
    search: string, 
    temp: string | null, 
    sort: 'name' | 'date' | null,
    locations: string[] = selectedLocations,
    floors: string[] = selectedFloors
  ) => {
    let filtered = [...data];
    
    if (search) {
      const normalizedSearch = normalizeSearchText(search);
      filtered = filtered.filter((lead) => {
        const nameMatch = lead.name.toLowerCase().includes(search.toLowerCase());
        const phoneMatch = lead.phone?.includes(search);
        const emailMatch = lead.email?.toLowerCase().includes(search.toLowerCase());
        const addressMatch = normalizeSearchText(lead.address || '').includes(normalizedSearch);
        return nameMatch || phoneMatch || emailMatch || addressMatch;
      });
    }
    
    if (temp) {
      filtered = filtered.filter((lead) => lead.lead_temperature === temp);
    }

    // Location filter (multi-select)
    if (locations.length > 0) {
      filtered = filtered.filter(lead =>
        locations.some(loc => lead.location?.toLowerCase().includes(loc.toLowerCase()))
      );
    }

    // Floor filter (multi-select)
    if (floors.length > 0) {
      filtered = filtered.filter(lead => {
        if (!lead.floor) return false;
        const normalizedLeadFloor = lead.floor.replace(/\s+/g, '').toLowerCase();
        return floors.some(floor => {
          const normalizedFilter = floor.replace(/\s+/g, '').toLowerCase();
          return normalizedLeadFloor.includes(normalizedFilter);
        });
      });
    }
    
    if (sort === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === 'date') {
      filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }
    
    setFilteredLeads(filtered);
  };

  const toggleLocation = (loc: string) => {
    const newLocations = selectedLocations.includes(loc)
      ? selectedLocations.filter(l => l !== loc)
      : [...selectedLocations, loc];
    setSelectedLocations(newLocations);
  };

  const toggleFloor = (floor: string) => {
    const newFloors = selectedFloors.includes(floor)
      ? selectedFloors.filter(f => f !== floor)
      : [...selectedFloors, floor];
    setSelectedFloors(newFloors);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeads();
    setRefreshing(false);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(leads, text, temperatureFilter, sortBy, selectedLocations, selectedFloors);
  };

  const handleTemperatureFilter = (temp: string | null) => {
    setTemperatureFilter(temp);
    applyFilters(leads, searchQuery, temp, sortBy, selectedLocations, selectedFloors);
  };

  const handleSort = (sort: 'name' | 'date' | null) => {
    setSortBy(sort);
    applyFilters(leads, searchQuery, temperatureFilter, sort, selectedLocations, selectedFloors);
  };

  const handleApplyLocationFloorFilters = () => {
    applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors);
  };

  const clearFilters = () => {
    setTemperatureFilter(null);
    setSortBy(null);
    setSelectedLocations([]);
    setSelectedFloors([]);
    applyFilters(leads, searchQuery, null, null, [], []);
  };

  const hasActiveFilters = () => {
    return temperatureFilter || sortBy || selectedLocations.length > 0 || selectedFloors.length > 0;
  };

  const getTemperatureColor = (temp: string | null) => {
    switch (temp) {
      case 'Hot': return '#EF4444';
      case 'Warm': return '#F59E0B';
      case 'Cold': return '#6366F1';
      default: return '#9CA3AF';
    }
  };

  const getTypeIcon = (type: string | null) => {
    return type === 'buyer' ? 'cart' : 'key';
  };

  const formatUnit = (unit: string | null): string => {
    if (!unit) return '';
    switch (unit.toUpperCase()) {
      case 'CR': return ' Cr';
      case 'L': return ' L';
      case 'K':
      case 'TH': return ' K';
      default: return ` ${unit}`;
    }
  };

  const formatBudget = (item: Lead): string => {
    if (!item.budget_min && !item.budget_max) return '';
    const unit = formatUnit(item.unit);
    if (item.budget_min && item.budget_max) {
      return `₹${item.budget_min}-${item.budget_max}${unit}`;
    } else if (item.budget_min) {
      return `₹${item.budget_min}${unit}+`;
    } else if (item.budget_max) {
      return `Up to ₹${item.budget_max}${unit}`;
    }
    return '';
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

  const renderLead = ({ item }: { item: Lead }) => {
    const budgetText = formatBudget(item);
    
    return (
      <View style={styles.leadCard}>
        {/* Main content - tappable to view details */}
        <TouchableOpacity
          style={styles.leadContent}
          onPress={() => router.push(`/leads/${item.id}` as any)}
        >
          <View style={styles.leadHeader}>
            <View style={styles.leadInfo}>
              <View style={styles.nameRow}>
                <Ionicons 
                  name={getTypeIcon(item.lead_type) as any} 
                  size={16} 
                  color="#3B82F6" 
                  style={styles.typeIcon}
                />
                <Text style={styles.leadName}>{item.name}</Text>
              </View>
              {item.created_by_name && (
                <Text style={styles.createdByText}>by {item.created_by_name}</Text>
              )}
              <View style={styles.leadMeta}>
                {item.phone && (
                  <View style={styles.metaItem}>
                    <Ionicons name="call" size={12} color="#6B7280" />
                    <Text style={styles.metaText}>{item.phone}</Text>
                  </View>
                )}
                {item.location && (
                  <View style={styles.metaItem}>
                    <Ionicons name="location" size={12} color="#6B7280" />
                    <Text style={styles.metaText}>{item.location}</Text>
                  </View>
                )}
              </View>
            </View>
            <View
              style={[
                styles.temperatureBadge,
                { backgroundColor: getTemperatureColor(item.lead_temperature) },
              ]}
            >
              <Text style={styles.temperatureText}>{item.lead_temperature || 'N/A'}</Text>
            </View>
          </View>

          {/* Client Preferences Section */}
          <View style={styles.preferencesContainer}>
            {item.floor && (
              <View style={styles.preferenceItem}>
                <Ionicons name="layers" size={14} color="#3B82F6" />
                <Text style={styles.preferenceText}>Floor: {item.floor}</Text>
              </View>
            )}
            {item.area_size && (
              <View style={styles.preferenceItem}>
                <Ionicons name="resize" size={14} color="#8B5CF6" />
                <Text style={styles.preferenceText}>Area: {item.area_size} sq.yds</Text>
              </View>
            )}
            {budgetText && (
              <View style={styles.preferenceItem}>
                <Ionicons name="wallet" size={14} color="#10B981" />
                <Text style={styles.preferenceText}>Budget: {budgetText}</Text>
              </View>
            )}
          </View>

          <View style={styles.leadFooter}>
            <View style={[styles.typeBadge, { backgroundColor: '#DBEAFE' }]}>
              <Text style={[styles.typeBadgeText, { color: '#1E40AF' }]}>
                {item.lead_type === 'buyer' ? 'Buyer' : 'Tenant'}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{item.lead_status || 'New'}</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Action Buttons Row */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleAddReminder(item)}
          >
            <Ionicons name="alarm-outline" size={18} color="#F59E0B" />
            <Text style={styles.actionText}>Reminder</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push(`/leads/edit/${item.id}` as any)}
          >
            <Ionicons name="create-outline" size={18} color="#3B82F6" />
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Client Leads</Text>
        <Text style={styles.headerSubtitle}>Buyers & Tenants ({filteredLeads.length})</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
        <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.filterButton}>
          <Ionicons name="filter" size={20} color={hasActiveFilters() ? '#3B82F6' : '#6B7280'} />
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.filterContainer}>
          {/* Location Selector */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Location:</Text>
            <TouchableOpacity
              style={styles.selectorButton}
              onPress={() => setShowLocationPicker(true)}
            >
              <Text style={[styles.selectorText, selectedLocations.length === 0 && styles.placeholderText]}>
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
                    onPress={() => {
                      toggleLocation(loc);
                      handleApplyLocationFloorFilters();
                    }}
                  >
                    <Text style={styles.selectedTagText}>{loc}</Text>
                    <Ionicons name="close" size={14} color="#6B7280" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Floor Selector */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Floor Preference:</Text>
            <TouchableOpacity
              style={styles.selectorButton}
              onPress={() => setShowFloorPicker(true)}
            >
              <Text style={[styles.selectorText, selectedFloors.length === 0 && styles.placeholderText]}>
                {selectedFloors.length > 0 
                  ? `${selectedFloors.length} selected` 
                  : 'Select floors'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
            {selectedFloors.length > 0 && (
              <View style={styles.selectedTags}>
                {selectedFloors.map(floor => (
                  <TouchableOpacity
                    key={floor}
                    style={styles.selectedTag}
                    onPress={() => {
                      toggleFloor(floor);
                      handleApplyLocationFloorFilters();
                    }}
                  >
                    <Text style={styles.selectedTagText}>{floor}</Text>
                    <Ionicons name="close" size={14} color="#6B7280" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Temperature:</Text>
            <View style={styles.filterOptions}>
              {['Hot', 'Warm', 'Cold'].map((temp) => (
                <TouchableOpacity
                  key={temp}
                  style={[
                    styles.filterChip,
                    temperatureFilter === temp && styles.filterChipActive,
                    { backgroundColor: temperatureFilter === temp ? getTemperatureColor(temp) : '#F3F4F6' }
                  ]}
                  onPress={() => handleTemperatureFilter(temperatureFilter === temp ? null : temp)}
                >
                  <Text style={[
                    styles.filterChipText,
                    temperatureFilter === temp && styles.filterChipTextActive
                  ]}>{temp}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Sort by:</Text>
            <View style={styles.filterOptions}>
              <TouchableOpacity
                style={[styles.filterChip, sortBy === 'name' && styles.filterChipActive]}
                onPress={() => handleSort(sortBy === 'name' ? null : 'name')}
              >
                <Ionicons name="text" size={14} color={sortBy === 'name' ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.filterChipText, sortBy === 'name' && styles.filterChipTextActive]}> Name</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, sortBy === 'date' && styles.filterChipActive]}
                onPress={() => handleSort(sortBy === 'date' ? null : 'date')}
              >
                <Ionicons name="calendar" size={14} color={sortBy === 'date' ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.filterChipText, sortBy === 'date' && styles.filterChipTextActive]}> Date</Text>
              </TouchableOpacity>
            </View>
          </View>
          {hasActiveFilters() && (
            <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
              <Text style={styles.clearFiltersText}>Clear All Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        data={filteredLeads}
        renderItem={renderLead}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No client leads found</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first client</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/leads/add')}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Location Picker Modal */}
      <Modal visible={showLocationPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Locations</Text>
              <TouchableOpacity onPress={() => {
                setShowLocationPicker(false);
                setLocationSearch('');
                handleApplyLocationFloorFilters();
              }}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchContainer}>
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
                  style={styles.pickerItem}
                  onPress={() => toggleLocation(item)}
                >
                  <Text style={styles.pickerItemText}>{item}</Text>
                  {selectedLocations.includes(item) && (
                    <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.pickerList}
              ListEmptyComponent={
                <View style={styles.emptySearchResult}>
                  <Text style={styles.emptySearchText}>No locations found</Text>
                </View>
              }
            />
            <TouchableOpacity
              style={styles.pickerDoneButton}
              onPress={() => {
                setShowLocationPicker(false);
                setLocationSearch('');
                handleApplyLocationFloorFilters();
              }}
            >
              <Text style={styles.pickerDoneText}>Done ({selectedLocations.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Floor Picker Modal */}
      <Modal visible={showFloorPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Floors</Text>
              <TouchableOpacity onPress={() => {
                setShowFloorPicker(false);
                setFloorSearch('');
                handleApplyLocationFloorFilters();
              }}>
                <Ionicons name="close" size={24} color="#374151" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchContainer}>
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
                  style={styles.pickerItem}
                  onPress={() => toggleFloor(item)}
                >
                  <Text style={styles.pickerItemText}>{item}</Text>
                  {selectedFloors.includes(item) && (
                    <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.pickerList}
              ListEmptyComponent={
                <View style={styles.emptySearchResult}>
                  <Text style={styles.emptySearchText}>No floors found</Text>
                </View>
              }
            />
            <TouchableOpacity
              style={styles.pickerDoneButton}
              onPress={() => {
                setShowFloorPicker(false);
                setFloorSearch('');
                handleApplyLocationFloorFilters();
              }}
            >
              <Text style={styles.pickerDoneText}>Done ({selectedFloors.length} selected)</Text>
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
    backgroundColor: '#3B82F6',
    padding: 20,
    paddingTop: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#DBEAFE',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    height: 44,
    marginLeft: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 100,
  },
  leadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    overflow: 'hidden',
  },
  leadContent: {
    padding: 16,
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  leadInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  typeIcon: {
    marginRight: 8,
  },
  leadName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  createdByText: {
    fontSize: 12,
    color: '#9CA3AF',
    marginLeft: 24,
    marginBottom: 6,
    fontStyle: 'italic',
  },
  leadMeta: {
    marginBottom: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
    marginLeft: 4,
  },
  temperatureBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  temperatureText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  leadFooter: {
    flexDirection: 'row',
    marginRight: 8,
  },
  preferencesContainer: {
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  preferenceText: {
    fontSize: 13,
    color: '#1E3A5F',
    marginLeft: 6,
    fontWeight: '500',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusBadge: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#16A34A',
  },
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
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
  filterButton: {
    padding: 8,
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 4,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  clearFiltersButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    marginTop: 4,
  },
  clearFiltersText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#EF4444',
  },
  // Location/Floor Selector Styles
  selectorButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorText: {
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
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: 300,
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
  modalSearchContainer: {
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
  pickerList: {
    flexGrow: 1,
  },
  pickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#1F2937',
  },
  pickerDoneButton: {
    backgroundColor: '#3B82F6',
    margin: 16,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  pickerDoneText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
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
