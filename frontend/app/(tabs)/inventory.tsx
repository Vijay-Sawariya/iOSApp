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
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineApi } from '../../services/offlineApi';
import { router, useFocusEffect } from 'expo-router';
import { useOffline } from '../../contexts/OfflineContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Lead,
  FloorPricing,
  getTypeColor,
  formatFloorPricing,
  normalizeSearchText,
  LOCATIONS,
  FLOORS,
  INVENTORY_STATUSES,
  FACINGS,
} from '../../constants/leadOptions';

// Filter arrays
const LOCATION_OPTIONS = [...LOCATIONS];
const FLOOR_OPTIONS = [...FLOORS];
const STATUS_OPTIONS = [...INVENTORY_STATUSES];
const FACING_OPTIONS = [...FACINGS];
const TYPE_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Sell', value: 'seller' },
  { label: 'Rent', value: 'landlord' },
  { label: 'Builder', value: 'builder' },
];

export default function InventoryLeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const { isOnline } = useOffline();
  
  // Filter states
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedFloors, setSelectedFloors] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedFacings, setSelectedFacings] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [budgetMin, setBudgetMin] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  
  // Modal states
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showFacingPicker, setShowFacingPicker] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [floorSearch, setFloorSearch] = useState('');
  const [statusSearch, setStatusSearch] = useState('');
  const [facingSearch, setFacingSearch] = useState('');

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

  const filteredStatuses = useMemo(() => 
    STATUS_OPTIONS.filter(status => 
      status.toLowerCase().includes(statusSearch.toLowerCase())
    ), [statusSearch]
  );

  const filteredFacings = useMemo(() => 
    FACING_OPTIONS.filter(facing => 
      facing.toLowerCase().includes(facingSearch.toLowerCase())
    ), [facingSearch]
  );

  // Stats calculations
  const stats = useMemo(() => ({
    total: leads.length,
    sellers: leads.filter(l => l.lead_type === 'seller').length,
    landlords: leads.filter(l => l.lead_type === 'landlord').length,
    builders: leads.filter(l => l.lead_type === 'builder').length,
  }), [leads]);

  const loadLeads = async () => {
    try {
      const data = await offlineApi.getInventoryLeads();
      setLeads(data);
      applyFilters(data, searchQuery);
    } catch (error) {
      console.error('Failed to load inventory leads:', error);
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
    locations: string[] = selectedLocations,
    floors: string[] = selectedFloors,
    statuses: string[] = selectedStatuses,
    facings: string[] = selectedFacings,
    type: string = typeFilter,
    aMin: string = areaMin,
    aMax: string = areaMax,
    bMin: string = budgetMin,
    bMax: string = budgetMax,
  ) => {
    let filtered = [...data];
    
    // Search filter
    if (search) {
      const normalizedSearch = normalizeSearchText(search);
      filtered = filtered.filter(
        (lead) =>
          normalizeSearchText(lead.name || '').includes(normalizedSearch) ||
          normalizeSearchText(lead.phone || '').includes(normalizedSearch) ||
          normalizeSearchText(lead.location || '').includes(normalizedSearch) ||
          normalizeSearchText(lead.address || '').includes(normalizedSearch)
      );
    }

    // Type filter
    if (type) {
      filtered = filtered.filter((lead) => lead.lead_type === type);
    }

    // Location filter
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

    // Floor filter
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

    // Status filter
    if (statuses.length > 0) {
      filtered = filtered.filter((lead) => {
        if (!lead.lead_status) return false;
        return statuses.some(s => lead.lead_status?.toLowerCase().includes(s.toLowerCase()));
      });
    }

    // Facing filter
    if (facings.length > 0) {
      filtered = filtered.filter((lead) => {
        if (!lead.building_facing) return false;
        return facings.some(f => lead.building_facing?.toLowerCase().includes(f.toLowerCase()));
      });
    }

    // Area filter
    if (aMin) {
      filtered = filtered.filter((lead) => {
        const area = parseFloat(lead.area_size || '0');
        return area >= parseFloat(aMin);
      });
    }
    if (aMax) {
      filtered = filtered.filter((lead) => {
        const area = parseFloat(lead.area_size || '0');
        return area <= parseFloat(aMax);
      });
    }

    // Budget filter based on floor_pricing
    // Logic: 
    // - If no floor is selected: search min/max price among ALL available floors
    // - If floor is selected: search only for those specific floors' prices
    if (bMin || bMax) {
      const budgetMinVal = bMin ? parseFloat(bMin) : 0;
      const budgetMaxVal = bMax ? parseFloat(bMax) : Infinity;
      
      filtered = filtered.filter((lead) => {
        // Get floor pricing array
        const floorPricing = lead.floor_pricing;
        if (!floorPricing || floorPricing.length === 0) {
          // No floor pricing data - skip this lead if budget filter is active
          return false;
        }
        
        let pricesToCheck: number[] = [];
        
        if (floors.length === 0) {
          // No floor selected - check ALL floors' prices
          pricesToCheck = floorPricing.map(fp => fp.floor_amount);
        } else {
          // Floors selected - only check those specific floors' prices
          pricesToCheck = floorPricing
            .filter(fp => {
              const fpLabel = fp.floor_label.toLowerCase();
              return floors.some(selectedFloor => 
                fpLabel.includes(selectedFloor.toLowerCase()) || 
                selectedFloor.toLowerCase().includes(fpLabel)
              );
            })
            .map(fp => fp.floor_amount);
        }
        
        if (pricesToCheck.length === 0) {
          // No matching floor prices found
          return false;
        }
        
        // Check if any price falls within the budget range
        // Logic: Lead matches if ANY of its floor prices fall within the budget range
        const minPrice = Math.min(...pricesToCheck);
        const maxPrice = Math.max(...pricesToCheck);
        
        // A lead matches if its price range overlaps with the search budget range
        // This means: lead's max price >= search min AND lead's min price <= search max
        return maxPrice >= budgetMinVal && minPrice <= budgetMaxVal;
      });
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
    applyFilters(leads, text);
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

  const toggleStatus = (status: string) => {
    const newStatuses = selectedStatuses.includes(status) 
      ? selectedStatuses.filter(s => s !== status) 
      : [...selectedStatuses, status];
    setSelectedStatuses(newStatuses);
  };

  const toggleFacing = (facing: string) => {
    const newFacings = selectedFacings.includes(facing) 
      ? selectedFacings.filter(f => f !== facing) 
      : [...selectedFacings, facing];
    setSelectedFacings(newFacings);
  };

  const handleApplyFilters = () => {
    applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax);
  };

  const hasActiveFilters = () => {
    return selectedLocations.length > 0 || selectedFloors.length > 0 || 
           selectedStatuses.length > 0 || selectedFacings.length > 0 ||
           typeFilter !== '' || areaMin !== '' || areaMax !== '' ||
           budgetMin !== '' || budgetMax !== '';
  };

  const clearAllFilters = () => {
    setSelectedLocations([]);
    setSelectedFloors([]);
    setSelectedStatuses([]);
    setSelectedFacings([]);
    setTypeFilter('');
    setAreaMin('');
    setAreaMax('');
    setBudgetMin('');
    setBudgetMax('');
    setSearchQuery('');
    applyFilters(leads, '', [], [], [], [], '', '', '', '', '');
  };

  const openMapUrl = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open map:', err));
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

  const getLeadTypeDisplay = (type: string | null) => {
    switch (type) {
      case 'seller': return 'Sell';
      case 'landlord': return 'Rent';
      case 'builder': return 'Builder';
      case 'agent': return 'Agent';
      default: return type || 'N/A';
    }
  };

  const renderLeadCard = ({ item }: { item: Lead }) => {
    const typeColor = getTypeColor(item.lead_type);
    const isHot = item.lead_temperature === 'Hot';
    const floorPricing = formatFloorPricing(item.floor_pricing, item.unit);
    const hasMapUrl = item.Property_locationUrl && item.Property_locationUrl.trim() !== '';

    return (
      <View style={styles.leadCard}>
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

  // Render multi-select picker modal
  const renderPickerModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    data: string[],
    selectedItems: string[],
    onToggle: (item: string) => void,
    searchValue: string,
    onSearchChange: (text: string) => void
  ) => (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.pickerModal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalSearchContainer}>
            <Ionicons name="search" size={20} color="#9CA3AF" />
            <TextInput
              style={styles.modalSearchInput}
              placeholder={`Search ${title.toLowerCase()}...`}
              placeholderTextColor="#9CA3AF"
              value={searchValue}
              onChangeText={onSearchChange}
            />
          </View>
          <FlatList
            data={data}
            keyExtractor={(item) => item}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.modalItem, selectedItems.includes(item) && styles.modalItemSelected]}
                onPress={() => onToggle(item)}
              >
                <Text style={styles.modalItemText}>{item}</Text>
                {selectedItems.includes(item) && (
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
              onClose();
              handleApplyFilters();
            }}
          >
            <Text style={styles.modalDoneBtnText}>Done ({selectedItems.length} selected)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Blue Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.blueHeader}>
          <Text style={styles.headerTitle}>Inventories</Text>
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
      </SafeAreaView>

      {/* Content Area */}
      <View style={styles.contentArea}>
        {/* Leads List with Header Components */}
        <FlatList
          data={filteredLeads}
          renderItem={renderLeadCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3B82F6']} />
          }
          ListHeaderComponent={
            <>
              {/* Stats Bar */}
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
                  value={searchQuery}
                  onChangeText={handleSearch}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => handleSearch('')}>
                    <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>

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
                              handleApplyFilters();
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
                    <Text style={styles.filterLabel}>Floor:</Text>
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
                              handleApplyFilters();
                            }}
                          >
                            <Text style={styles.selectedTagText}>{floor}</Text>
                            <Ionicons name="close" size={14} color="#6B7280" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Type Filter */}
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Type:</Text>
                    <View style={styles.filterOptions}>
                      {TYPE_OPTIONS.map((t) => (
                        <TouchableOpacity
                          key={t.value}
                          style={[
                            styles.filterChip,
                            typeFilter === t.value && styles.filterChipActive,
                          ]}
                          onPress={() => {
                            setTypeFilter(typeFilter === t.value ? '' : t.value);
                            setTimeout(handleApplyFilters, 0);
                          }}
                        >
                          <Text style={[
                            styles.filterChipText,
                            typeFilter === t.value && styles.filterChipTextActive
                          ]}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Status Selector */}
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Status:</Text>
                    <TouchableOpacity
                      style={styles.selectorButton}
                      onPress={() => setShowStatusPicker(true)}
                    >
                      <Text style={[styles.selectorText, selectedStatuses.length === 0 && styles.placeholderText]}>
                        {selectedStatuses.length > 0 
                          ? `${selectedStatuses.length} selected` 
                          : 'Select statuses'}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    {selectedStatuses.length > 0 && (
                      <View style={styles.selectedTags}>
                        {selectedStatuses.map(status => (
                          <TouchableOpacity
                            key={status}
                            style={styles.selectedTag}
                            onPress={() => {
                              toggleStatus(status);
                              handleApplyFilters();
                            }}
                          >
                            <Text style={styles.selectedTagText}>{status}</Text>
                            <Ionicons name="close" size={14} color="#6B7280" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  {/* Area Range */}
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Area (Sq Yds):</Text>
                    <View style={styles.rangeRow}>
                      <TextInput
                        style={styles.rangeInput}
                        placeholder="Min"
                        placeholderTextColor="#9CA3AF"
                        value={areaMin}
                        onChangeText={(text) => {
                          setAreaMin(text);
                        }}
                        onBlur={handleApplyFilters}
                        keyboardType="numeric"
                      />
                      <Text style={styles.rangeSeparator}>-</Text>
                      <TextInput
                        style={styles.rangeInput}
                        placeholder="Max"
                        placeholderTextColor="#9CA3AF"
                        value={areaMax}
                        onChangeText={(text) => {
                          setAreaMax(text);
                        }}
                        onBlur={handleApplyFilters}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Budget Range */}
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Budget (CR):</Text>
                    <View style={styles.rangeRow}>
                      <TextInput
                        style={styles.rangeInput}
                        placeholder="Min"
                        placeholderTextColor="#9CA3AF"
                        value={budgetMin}
                        onChangeText={(text) => {
                          setBudgetMin(text);
                        }}
                        onBlur={handleApplyFilters}
                        keyboardType="numeric"
                      />
                      <Text style={styles.rangeSeparator}>-</Text>
                      <TextInput
                        style={styles.rangeInput}
                        placeholder="Max"
                        placeholderTextColor="#9CA3AF"
                        value={budgetMax}
                        onChangeText={(text) => {
                          setBudgetMax(text);
                        }}
                        onBlur={handleApplyFilters}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>

                  {/* Facing Selector */}
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>Facing:</Text>
                    <TouchableOpacity
                      style={styles.selectorButton}
                      onPress={() => setShowFacingPicker(true)}
                    >
                      <Text style={[styles.selectorText, selectedFacings.length === 0 && styles.placeholderText]}>
                        {selectedFacings.length > 0 
                          ? `${selectedFacings.length} selected` 
                          : 'Select facings'}
                      </Text>
                      <Ionicons name="chevron-down" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    {selectedFacings.length > 0 && (
                      <View style={styles.selectedTags}>
                        {selectedFacings.map(facing => (
                          <TouchableOpacity
                            key={facing}
                            style={styles.selectedTag}
                            onPress={() => {
                              toggleFacing(facing);
                              handleApplyFilters();
                            }}
                          >
                            <Text style={styles.selectedTagText}>{facing}</Text>
                            <Ionicons name="close" size={14} color="#6B7280" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  
                  {hasActiveFilters() && (
                    <TouchableOpacity style={styles.clearFiltersBtn} onPress={clearAllFilters}>
                      <Ionicons name="refresh" size={16} color="#EF4444" />
                      <Text style={styles.clearFiltersText}>Clear All Filters</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="home-outline" size={64} color="#D1D5DB" />
              <Text style={styles.emptyText}>No inventory found</Text>
              <Text style={styles.emptySubtext}>
                {hasActiveFilters() ? 'Try adjusting your filters' : 'Add your first inventory to get started'}
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
      {renderPickerModal(
        showLocationPicker,
        () => { setShowLocationPicker(false); setLocationSearch(''); },
        'Select Locations',
        filteredLocations,
        selectedLocations,
        toggleLocation,
        locationSearch,
        setLocationSearch
      )}

      {/* Floor Picker Modal */}
      {renderPickerModal(
        showFloorPicker,
        () => { setShowFloorPicker(false); setFloorSearch(''); },
        'Select Floors',
        filteredFloors,
        selectedFloors,
        toggleFloor,
        floorSearch,
        setFloorSearch
      )}

      {/* Status Picker Modal */}
      {renderPickerModal(
        showStatusPicker,
        () => { setShowStatusPicker(false); setStatusSearch(''); },
        'Select Statuses',
        filteredStatuses,
        selectedStatuses,
        toggleStatus,
        statusSearch,
        setStatusSearch
      )}

      {/* Facing Picker Modal */}
      {renderPickerModal(
        showFacingPicker,
        () => { setShowFacingPicker(false); setFacingSearch(''); },
        'Select Facings',
        filteredFacings,
        selectedFacings,
        toggleFacing,
        facingSearch,
        setFacingSearch
      )}

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
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
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
  filterScrollContainer: {
    maxHeight: 400,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterScrollContent: {
    padding: 16,
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
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rangeInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: '#1F2937',
  },
  rangeSeparator: {
    marginHorizontal: 12,
    fontSize: 16,
    color: '#6B7280',
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
});
