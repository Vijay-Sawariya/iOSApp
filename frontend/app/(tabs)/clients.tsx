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
import { SafeAreaView } from 'react-native-safe-area-context';

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
  property_type: string | null;
  bhk: string | null;
  building_facing: string | null;
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
  const [selectedStatTile, setSelectedStatTile] = useState<string>('total'); // 'total', 'buyer', 'tenant'

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

  // Stats calculations
  const stats = useMemo(() => {
    const total = leads.length;
    const buyers = leads.filter(l => l.lead_type === 'buyer').length;
    const tenants = leads.filter(l => l.lead_type === 'tenant').length;
    const agents = leads.filter(l => l.lead_type === 'agent').length;
    return { total, buyers, tenants, agents };
  }, [leads]);

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
    floors: string[] = selectedFloors,
    statTile: string = selectedStatTile
  ) => {
    let filtered = [...data];

    // Stat tile filter (from clicking the count tiles)
    if (statTile && statTile !== 'total') {
      filtered = filtered.filter((lead) => lead.lead_type === statTile);
    }
    
    if (search) {
      const normalizedSearch = normalizeSearchText(search);
      filtered = filtered.filter(
        (lead) =>
          normalizeSearchText(lead.name || '').includes(normalizedSearch) ||
          normalizeSearchText(lead.phone || '').includes(normalizedSearch) ||
          normalizeSearchText(lead.location || '').includes(normalizedSearch)
      );
    }

    if (temp) {
      filtered = filtered.filter((lead) => lead.lead_temperature === temp);
    }

    // Filter by selected locations
    if (locations.length > 0) {
      filtered = filtered.filter((lead) => {
        if (!lead.location) return false;
        const leadLocations = lead.location.split(',').map(l => l.trim().toLowerCase());
        return locations.some(selectedLoc => 
          leadLocations.some(leadLoc => 
            leadLoc.includes(selectedLoc.toLowerCase()) || 
            selectedLoc.toLowerCase().includes(leadLoc)
          )
        );
      });
    }

    // Filter by selected floors
    if (floors.length > 0) {
      filtered = filtered.filter((lead) => {
        if (!lead.floor) return false;
        const leadFloors = lead.floor.split(',').map(f => f.trim().toLowerCase());
        return floors.some(selectedFloor => 
          leadFloors.some(leadFloor => 
            leadFloor.includes(selectedFloor.toLowerCase()) || 
            selectedFloor.toLowerCase().includes(leadFloor)
          )
        );
      });
    }

    if (sort === 'name') {
      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sort === 'date') {
      filtered.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }

    setFilteredLeads(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeads();
    setRefreshing(false);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(leads, text, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile);
  };

  const handleTemperatureFilter = (temp: string | null) => {
    setTemperatureFilter(temp);
    applyFilters(leads, searchQuery, temp, sortBy, selectedLocations, selectedFloors, selectedStatTile);
  };

  const handleSort = (sort: 'name' | 'date' | null) => {
    setSortBy(sort);
    applyFilters(leads, searchQuery, temperatureFilter, sort, selectedLocations, selectedFloors, selectedStatTile);
  };

  const handleStatTileClick = (tile: string) => {
    setSelectedStatTile(tile);
    applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, tile);
  };

  const toggleLocation = (loc: string) => {
    setSelectedLocations(prev => 
      prev.includes(loc) ? prev.filter(l => l !== loc) : [...prev, loc]
    );
  };

  const toggleFloor = (floor: string) => {
    setSelectedFloors(prev => 
      prev.includes(floor) ? prev.filter(f => f !== floor) : [...prev, floor]
    );
  };

  const handleApplyLocationFloorFilters = () => {
    applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile);
  };

  const hasActiveFilters = () => {
    return temperatureFilter !== null || sortBy !== null || selectedLocations.length > 0 || selectedFloors.length > 0 || selectedStatTile !== 'total';
  };

  const clearAllFilters = () => {
    setTemperatureFilter(null);
    setSortBy(null);
    setSelectedLocations([]);
    setSelectedFloors([]);
    setSearchQuery('');
    setSelectedStatTile('total');
    applyFilters(leads, '', null, null, [], [], 'total');
  };

  const getTemperatureColor = (temp: string | null) => {
    switch (temp) {
      case 'Hot': return '#EF4444';
      case 'Warm': return '#F59E0B';
      case 'Cold': return '#3B82F6';
      default: return '#6B7280';
    }
  };

  const getLeadTypeDisplay = (type: string | null) => {
    switch (type) {
      case 'buyer': return 'Buy';
      case 'tenant': return 'Rent';
      case 'agent': return 'Agent';
      default: return type || 'N/A';
    }
  };

  const getLeadTypeColor = (type: string | null) => {
    switch (type) {
      case 'buyer': return { bg: '#DCFCE7', text: '#16A34A' };
      case 'tenant': return { bg: '#FEF3C7', text: '#D97706' };
      case 'agent': return { bg: '#FCE7F3', text: '#DB2777' };
      default: return { bg: '#F3F4F6', text: '#6B7280' };
    }
  };

  const formatUnit = (unit: string | null): string => {
    if (!unit) return '';
    switch (unit.toUpperCase()) {
      case 'CR': return ' CR';
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
      return `₹${item.budget_min} - ₹${item.budget_max}${unit}`;
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
    const typeColor = getLeadTypeColor(item.lead_type);
    const isHot = item.lead_temperature === 'Hot';
    
    return (
      <View style={styles.leadCard}>
        {/* Main content - tappable to view details */}
        <TouchableOpacity
          style={styles.leadContent}
          onPress={() => router.push(`/leads/${item.id}` as any)}
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
            {item.floor && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.floor}</Text>
              </View>
            )}
            {item.lead_status && (
              <View style={[styles.tag, styles.statusTag]}>
                <Text style={[styles.tagText, styles.statusTagText]}>{item.lead_status}</Text>
              </View>
            )}
          </View>

          {/* Budget Row */}
          {budgetText && (
            <View style={styles.budgetRow}>
              <Ionicons name="eye" size={16} color="#10B981" />
              <Text style={styles.budgetText}>{budgetText}</Text>
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
      {/* Blue Header with Title and Filter */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.blueHeader}>
          <Text style={styles.headerTitle}>Clients</Text>
          <View style={styles.headerActions}>
            <TouchableOpacity 
              style={styles.headerIconBtn}
              onPress={() => setShowFilters(!showFilters)}
            >
              <Ionicons 
                name="options-outline" 
                size={22} 
                color={hasActiveFilters() ? '#FFD700' : '#FFFFFF'} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* White Content Area */}
      <View style={styles.contentArea}>
        {/* Stats Bar - Clickable Tiles */}
        <View style={styles.statsBar}>
          <TouchableOpacity 
            style={[styles.statItem, selectedStatTile === 'total' && styles.statItemActive]}
            onPress={() => handleStatTileClick('total')}
          >
            <Text style={[styles.statNumber, selectedStatTile === 'total' && styles.statNumberActive]}>{stats.total}</Text>
            <Text style={[styles.statLabel, selectedStatTile === 'total' && styles.statLabelActive]}>Total</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statItem, selectedStatTile === 'buyer' && styles.statItemActive]}
            onPress={() => handleStatTileClick('buyer')}
          >
            <Text style={[styles.statNumber, selectedStatTile === 'buyer' && styles.statNumberActive]}>{stats.buyers}</Text>
            <Text style={[styles.statLabel, selectedStatTile === 'buyer' && styles.statLabelActive]}>Buyers</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statItem, selectedStatTile === 'tenant' && styles.statItemActive]}
            onPress={() => handleStatTileClick('tenant')}
          >
            <Text style={[styles.statNumber, selectedStatTile === 'tenant' && styles.statNumberActive]}>{stats.tenants}</Text>
            <Text style={[styles.statLabel, selectedStatTile === 'tenant' && styles.statLabelActive]}>Tenants</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statItem, selectedStatTile === 'agent' && styles.statItemActive]}
            onPress={() => handleStatTileClick('agent')}
          >
            <Text style={[styles.statNumber, selectedStatTile === 'agent' && styles.statNumberActive]}>{stats.agents}</Text>
            <Text style={[styles.statLabel, selectedStatTile === 'agent' && styles.statLabelActive]}>Agents</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search clients..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={handleSearch}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close-circle" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Result Count */}
        {(searchQuery || hasActiveFilters()) && (
          <View style={styles.resultCountContainer}>
            <Text style={styles.resultCountText}>
              Showing {filteredLeads.length} of {leads.length} results
            </Text>
            {hasActiveFilters() && (
              <TouchableOpacity onPress={clearAllFilters} style={styles.clearFiltersBtn}>
                <Text style={styles.clearFiltersText}>Clear Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Filter Panel */}
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
            
            {hasActiveFilters() && (
              <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearAllFilters}>
                <Ionicons name="refresh" size={16} color="#EF4444" />
                <Text style={styles.clearFiltersText}>Clear All Filters</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Leads List */}
        <FlatList
          data={filteredLeads}
          renderItem={renderLead}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3B82F6']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>No clients found</Text>
              <Text style={styles.emptySubtext}>
                {hasActiveFilters() ? 'Try adjusting your filters' : 'Add your first client to get started'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      </View>

      {/* Location Picker Modal */}
      <Modal
        visible={showLocationPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLocationPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Locations</Text>
              <TouchableOpacity onPress={() => setShowLocationPicker(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchContainer}>
              <Ionicons name="search" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search locations..."
                placeholderTextColor="#9CA3AF"
                value={locationSearch}
                onChangeText={setLocationSearch}
              />
            </View>
            <FlatList
              data={filteredLocations}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedLocations.includes(item) && styles.modalItemSelected]}
                  onPress={() => toggleLocation(item)}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                  {selectedLocations.includes(item) && (
                    <Ionicons name="checkmark-circle" size={22} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.modalList}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
            />
            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => {
                setShowLocationPicker(false);
                handleApplyLocationFloorFilters();
              }}
            >
              <Text style={styles.modalDoneBtnText}>Done ({selectedLocations.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Floor Picker Modal */}
      <Modal
        visible={showFloorPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFloorPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Floors</Text>
              <TouchableOpacity onPress={() => setShowFloorPicker(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalSearchContainer}>
              <Ionicons name="search" size={20} color="#9CA3AF" />
              <TextInput
                style={styles.modalSearchInput}
                placeholder="Search floors..."
                placeholderTextColor="#9CA3AF"
                value={floorSearch}
                onChangeText={setFloorSearch}
              />
            </View>
            <FlatList
              data={filteredFloors}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, selectedFloors.includes(item) && styles.modalItemSelected]}
                  onPress={() => toggleFloor(item)}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                  {selectedFloors.includes(item) && (
                    <Ionicons name="checkmark-circle" size={22} color="#3B82F6" />
                  )}
                </TouchableOpacity>
              )}
              style={styles.modalList}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
            />
            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => {
                setShowFloorPicker(false);
                handleApplyLocationFloorFilters();
              }}
            >
              <Text style={styles.modalDoneBtnText}>Done ({selectedFloors.length} selected)</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* FAB - Blue Floating Add Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/leads/add?type=client' as any)}
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
    paddingVertical: 12,
    borderRadius: 12,
    marginHorizontal: 4,
  },
  statItemActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: '#374151',
  },
  statNumberActive: {
    color: '#3B82F6',
  },
  statLabel: {
    fontSize: 12,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  filterContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterSection: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  filterOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterChipActive: {
    backgroundColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    minHeight: 48,
  },
  selectorText: {
    fontSize: 15,
    color: '#1F2937',
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  selectedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 8,
  },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  selectedTagText: {
    fontSize: 13,
    color: '#3B82F6',
    marginRight: 4,
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    marginTop: 8,
  },
  clearFiltersText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
    marginLeft: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
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
    backgroundColor: '#F9FAFB',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    height: 44,
  },
  modalSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: '#1F2937',
  },
  modalList: {
    maxHeight: 400,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  modalItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  modalItemText: {
    fontSize: 16,
    color: '#1F2937',
  },
  modalDoneBtn: {
    backgroundColor: '#3B82F6',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  resultCountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#EFF6FF',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  resultCountText: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '500',
  },
  clearFiltersBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  clearFiltersText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
