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
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineApi } from '../../services/offlineApi';
import { router, useFocusEffect } from 'expo-router';
import { useOffline } from '../../contexts/OfflineContext';
import { useAuth } from '../../contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import InventoryFileUpload from '../../components/InventoryFileUpload';
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
  canViewSensitiveData,
  maskPhone,
  maskAddress,
  getAgingStyles,
} from '../../constants/leadOptions';
import { api } from '../../services/api';

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
  const { user } = useAuth();  // Get current user for permission checks
  
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
  const [addressFilter, setAddressFilter] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [budgetSearch, setBudgetSearch] = useState(''); // Single budget field for +/- 10% search
  const [selectedStatTile, setSelectedStatTile] = useState<string>('total'); // 'total', 'seller', 'landlord', 'builder'
  
  // Client/Buyer matching states
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [preferredInventoryIds, setPreferredInventoryIds] = useState<number[]>([]);
  
  // Modal states
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showFacingPicker, setShowFacingPicker] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [floorSearch, setFloorSearch] = useState('');
  const [statusSearch, setStatusSearch] = useState('');
  const [facingSearch, setFacingSearch] = useState('');
  const [showFloorDropdown, setShowFloorDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showFacingDropdown, setShowFacingDropdown] = useState(false);
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

  // Filtered clients list for dropdown
  const filteredClients = useMemo(() => 
    clients.filter(client => 
      (client.name || '').toLowerCase().includes(clientSearch.toLowerCase()) ||
      (client.phone || '').includes(clientSearch) ||
      (client.location || '').toLowerCase().includes(clientSearch.toLowerCase())
    ), [clients, clientSearch]
  );

  // Stats calculations
  const stats = useMemo(() => ({
    total: leads.length,
    sellers: leads.filter(l => l.lead_type === 'seller').length,
    landlords: leads.filter(l => l.lead_type === 'landlord').length,
    builders: leads.filter(l => l.lead_type === 'builder').length,
  }), [leads]);

  // Load clients (buyers/tenants) for the dropdown
  const loadClients = async () => {
    try {
      const data = await offlineApi.getClientLeads();
      setClients(data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    }
  };

  const loadLeads = async () => {
    try {
      const data = await offlineApi.getInventoryLeads();
      setLeads(data);
      // Apply filters with current state values
      applyFilters(
        data, 
        searchQuery,
        selectedLocations,
        selectedFloors,
        selectedStatuses,
        selectedFacings,
        typeFilter,
        areaMin,
        areaMax,
        budgetMin,
        budgetMax,
        addressFilter,
        selectedStatTile,
        phoneFilter,
        budgetSearch,
        selectedClient,
        preferredInventoryIds
      );
    } catch (error) {
      console.error('Failed to load inventory leads:', error);
    }
  };

  // Use a ref to track if we should reload on focus
  const loadLeadsRef = React.useRef(loadLeads);
  loadLeadsRef.current = loadLeads;

  useFocusEffect(
    useCallback(() => {
      loadLeadsRef.current();
      loadClients(); // Load clients when screen focuses
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
    addrFilter: string = addressFilter,
    statTile: string = selectedStatTile,
    phone: string = phoneFilter,
    budgetSrch: string = budgetSearch,
    client: any = selectedClient,
    preferredIds: number[] = preferredInventoryIds,
  ) => {
    let filtered = [...data];
    
    // Client/Buyer matching filter - If a client is selected, filter inventory to only show preferred/matched properties
    if (client && preferredIds.length > 0) {
      // Filter to only show inventory that's in the preferred list for this client
      filtered = filtered.filter((inventory) => preferredIds.includes(inventory.id));
    } else if (client && preferredIds.length === 0) {
      // Client selected but no preferred inventory - show empty list
      filtered = [];
    }
    
    // Stat tile filter (from clicking the count tiles)
    if (statTile && statTile !== 'total') {
      filtered = filtered.filter((lead) => lead.lead_type === statTile);
    }
    
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

    // Phone filter (dedicated filter field)
    if (phone) {
      const normalizedPhone = phone.replace(/[^0-9]/g, '');
      filtered = filtered.filter((lead) => {
        const leadPhone = (lead.phone || '').replace(/[^0-9]/g, '');
        return leadPhone.includes(normalizedPhone);
      });
    }

    // Address filter (dedicated filter field)
    if (addrFilter) {
      const normalizedAddr = normalizeSearchText(addrFilter);
      filtered = filtered.filter((lead) =>
        normalizeSearchText(lead.address || '').includes(normalizedAddr)
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
    // If budgetSearch is provided, search with +/- 10% range
    // If budgetMin/budgetMax are provided, use exact range
    if (budgetSrch || bMin || bMax) {
      let budgetMinVal: number;
      let budgetMaxVal: number;
      
      if (budgetSrch) {
        // Single budget value with +/- 10% range
        const searchBudget = parseFloat(budgetSrch);
        if (!isNaN(searchBudget)) {
          budgetMinVal = searchBudget * 0.9; // -10%
          budgetMaxVal = searchBudget * 1.1; // +10%
        } else {
          budgetMinVal = 0;
          budgetMaxVal = Infinity;
        }
      } else {
        // Explicit min/max range
        budgetMinVal = bMin ? parseFloat(bMin) : 0;
        budgetMaxVal = bMax ? parseFloat(bMax) : Infinity;
      }
      
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
    applyFilters(leads, text, selectedLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
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

  const handleStatTileClick = (tile: string) => {
    setSelectedStatTile(tile);
    applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, tile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
  };

  const handleApplyFilters = () => {
    applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
  };

  const hasActiveFilters = () => {
    return selectedLocations.length > 0 || selectedFloors.length > 0 || 
           selectedStatuses.length > 0 || selectedFacings.length > 0 ||
           typeFilter !== '' || areaMin !== '' || areaMax !== '' ||
           budgetMin !== '' || budgetMax !== '' || addressFilter !== '' ||
           phoneFilter !== '' || budgetSearch !== '' ||
           selectedStatTile !== 'total' || selectedClient !== null;
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
    setAddressFilter('');
    setPhoneFilter('');
    setBudgetSearch('');
    setSearchQuery('');
    setSelectedStatTile('total');
    setSelectedClient(null);
    setClientSearch('');
    setPreferredInventoryIds([]);
    applyFilters(leads, '', [], [], [], [], '', '', '', '', '', '', 'total', '', '', null, []);
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
            loadLeadsRef.current();
            Alert.alert('Success', 'Lead deleted successfully');
          } catch (error: any) {
            console.error('Delete error:', error);
            Alert.alert('Error', error.message || 'Failed to delete lead');
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

    // Check if user can view sensitive data for this lead
    const canViewData = canViewSensitiveData(user?.role, user?.id, item.created_by);
    
    // Determine what to display for phone and address (location is always visible)
    const displayPhone = canViewData ? item.phone : maskPhone(item.phone);
    const maskedAddress = canViewData ? item.address : (item.address ? '**********' : null);
    const displayAddressLocation = [maskedAddress, item.location].filter(Boolean).join(', ');

    // Parse amenities from required_amenities field or individual amenity fields
    const amenitiesList: string[] = [];
    if ((item as any).park === '1' || (item as any).park === 1) amenitiesList.push('Park');
    if ((item as any).corner === '1' || (item as any).corner === 1) amenitiesList.push('Corner');
    if ((item as any).gated_community === '1' || (item as any).gated_community === 1) amenitiesList.push('Gated');
    if ((item as any).sample_flat === '1' || (item as any).sample_flat === 1) amenitiesList.push('Sample Flat');
    if ((item as any).main_road === '1' || (item as any).main_road === 1) amenitiesList.push('Main Road');
    if ((item as any).parking === '1' || (item as any).parking === 1) amenitiesList.push('Parking');
    if ((item as any).lift === '1' || (item as any).lift === 1 || item.lift === 'Yes') amenitiesList.push('Lift');
    if ((item as any).stilt === '1' || (item as any).stilt === 1) amenitiesList.push('Stilt');

    // Get aging info
    const agingStyles = getAgingStyles(item.aging_color);

    return (
      <View style={styles.leadCard}>
        {/* Aging & Temperature Banner */}
        <View style={styles.agingBanner}>
          {/* Aging Indicator */}
          <View style={[styles.agingBadge, { backgroundColor: agingStyles.bg }]}>
            <Ionicons 
              name="time-outline" 
              size={14} 
              color={agingStyles.text} 
            />
            <Text style={[styles.agingText, { color: agingStyles.text }]}>
              {item.aging_label || 'Never contacted'}
            </Text>
          </View>
          
          {/* Temperature Indicator */}
          <View style={[styles.tempBadge, { backgroundColor: (typeColor.text || '#9CA3AF') + '15' }]}>
            <View style={[styles.tempDot, { backgroundColor: isHot ? '#EF4444' : item.lead_temperature === 'Warm' ? '#F59E0B' : '#3B82F6' }]} />
            <Text style={[styles.tempText, { color: isHot ? '#EF4444' : item.lead_temperature === 'Warm' ? '#F59E0B' : '#3B82F6' }]}>
              {item.lead_temperature || 'N/A'}
            </Text>
          </View>
        </View>
        
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

          {/* Phone Row - Only show Call/WhatsApp if user can view data */}
          {item.phone && (
            <View style={styles.infoRow}>
              <Ionicons name="call" size={14} color={canViewData ? "#3B82F6" : "#9CA3AF"} />
              <Text style={[styles.infoText, canViewData && styles.linkText]}>{displayPhone}</Text>
              {canViewData && (
                <>
                  <TouchableOpacity 
                    style={styles.whatsappButton}
                    onPress={() => Linking.openURL(`tel:${item.phone}`)}
                  >
                    <Ionicons name="call" size={16} color="#3B82F6" />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.whatsappButton}
                    onPress={() => {
                      const cleanPhone = (item.phone || '').replace(/[^0-9]/g, '');
                      Linking.openURL(`https://wa.me/91${cleanPhone}`);
                    }}
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* Address & Location Row */}
          {(item.address || item.location) && (
            <View style={styles.infoRow}>
              <Ionicons name="location" size={14} color={canViewData && hasMapUrl ? "#3B82F6" : "#6B7280"} />
              <Text 
                style={[styles.infoText, canViewData && hasMapUrl && styles.linkText]} 
                numberOfLines={2}
              >
                {displayAddressLocation}
              </Text>
              {canViewData && hasMapUrl && (
                <TouchableOpacity onPress={() => openMapUrl(item.Property_locationUrl!)}>
                  <Ionicons name="open-outline" size={14} color="#3B82F6" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Tags Row - Removed property_type, added floor and facing */}
          <View style={styles.tagsRow}>
            {item.floor && (
              <View style={[styles.tag, styles.floorTag]}>
                <Ionicons name="layers-outline" size={12} color="#6366F1" />
                <Text style={[styles.tagText, { color: '#6366F1', marginLeft: 3 }]}>{item.floor}</Text>
              </View>
            )}
            {item.building_facing && (
              <View style={[styles.tag, styles.facingTag]}>
                <Ionicons name="compass-outline" size={12} color="#0891B2" />
                <Text style={[styles.tagText, { color: '#0891B2', marginLeft: 3 }]}>{item.building_facing}</Text>
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
          {amenitiesList.length > 0 && (
            <View style={styles.amenitiesRow}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={styles.amenitiesText} numberOfLines={1}>
                {amenitiesList.join(' • ')}
              </Text>
            </View>
          )}

          {/* Floor Pricing Row */}
          {floorPricing && (
            <View style={styles.budgetRow}>
              <Ionicons name="cash-outline" size={16} color="#10B981" />
              <Text style={styles.budgetText}>{floorPricing}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Action Buttons Row - Edit/Delete only visible if user has permission */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleAddReminder(item)}
          >
            <Ionicons name="alarm-outline" size={18} color="#F59E0B" />
            <Text style={[styles.actionText, { color: '#F59E0B' }]}>Reminder</Text>
          </TouchableOpacity>
          {canViewData && (
            <>
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
            </>
          )}
        </View>
        
        {/* File Upload Row */}
        <View style={styles.fileUploadRow}>
          <InventoryFileUpload leadId={item.id} compact />
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
      <KeyboardAvoidingView 
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchValue.length > 0 && (
              <TouchableOpacity onPress={() => onSearchChange('')}>
                <Ionicons name="close-circle" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
          {/* Show count of filtered results */}
          {searchValue.length > 0 && (
            <Text style={styles.searchResultCount}>
              {data.length} {data.length === 1 ? 'result' : 'results'} found
            </Text>
          )}
          <FlatList
            data={data}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
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
            ListEmptyComponent={
              <View style={styles.emptySearchResult}>
                <Text style={styles.emptySearchText}>No results found</Text>
              </View>
            }
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
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {/* Blue Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.blueHeader}>
          <Text style={styles.headerTitle}>Inventories</Text>
          <View style={styles.headerActions}>
            {/* Map View Button */}
            <TouchableOpacity 
              style={styles.headerIconBtn}
              onPress={() => router.push('/map' as any)}
            >
              <Ionicons name="map-outline" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            {/* Filter Button */}
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
                  style={[styles.statItem, selectedStatTile === 'seller' && styles.statItemActive]}
                  onPress={() => handleStatTileClick('seller')}
                >
                  <Text style={[styles.statNumber, selectedStatTile === 'seller' && styles.statNumberActive]}>{stats.sellers}</Text>
                  <Text style={[styles.statLabel, selectedStatTile === 'seller' && styles.statLabelActive]}>Sellers</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.statItem, selectedStatTile === 'landlord' && styles.statItemActive]}
                  onPress={() => handleStatTileClick('landlord')}
                >
                  <Text style={[styles.statNumber, selectedStatTile === 'landlord' && styles.statNumberActive]}>{stats.landlords}</Text>
                  <Text style={[styles.statLabel, selectedStatTile === 'landlord' && styles.statLabelActive]}>Landlords</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.statItem, selectedStatTile === 'builder' && styles.statItemActive]}
                  onPress={() => handleStatTileClick('builder')}
                >
                  <Text style={[styles.statNumber, selectedStatTile === 'builder' && styles.statNumberActive]}>{stats.builders}</Text>
                  <Text style={[styles.statLabel, selectedStatTile === 'builder' && styles.statLabelActive]}>Builders</Text>
                </TouchableOpacity>
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
                  {/* Match with Buyer/Tenant Dropdown */}
                  <View style={[styles.filterSection, { zIndex: 600 }]}>
                    <Text style={styles.filterLabel}>{'Match with Buyer/Tenant:'}</Text>
                    <View style={styles.clientDropdownContainer}>
                      <View style={styles.compactInputContainer}>
                        <Ionicons name="person-outline" size={16} color="#6B7280" />
                        <TextInput
                          style={styles.compactInput}
                          placeholder="Search buyer/tenant..."
                          placeholderTextColor="#9CA3AF"
                          value={selectedClient ? selectedClient.name : clientSearch}
                          onChangeText={(text) => {
                            setClientSearch(text);
                            setShowClientDropdown(true);
                            if (selectedClient) {
                              setSelectedClient(null);
                              handleApplyFilters();
                            }
                          }}
                          onFocus={() => setShowClientDropdown(true)}
                        />
                        {(selectedClient || clientSearch) && (
                          <TouchableOpacity onPress={() => {
                            setSelectedClient(null);
                            setClientSearch('');
                            setShowClientDropdown(false);
                            setPreferredInventoryIds([]);
                            applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, null, []);
                          }}>
                            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        )}
                      </View>
                      {/* Client dropdown results */}
                      {showClientDropdown && clientSearch.length > 0 && filteredClients.length > 0 && !selectedClient && (
                        <View style={styles.clientDropdown}>
                          <ScrollView style={styles.clientDropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {filteredClients.slice(0, 8).map((client) => (
                              <TouchableOpacity
                                key={client.id}
                                style={styles.clientDropdownItem}
                                onPress={async () => {
                                  setSelectedClient(client);
                                  setClientSearch('');
                                  setShowClientDropdown(false);
                                  // Fetch preferred inventory IDs for this client
                                  try {
                                    const ids = await api.getPreferredInventoryIds(client.id);
                                    setPreferredInventoryIds(ids);
                                    applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, client, ids);
                                  } catch (error) {
                                    console.error('Failed to fetch preferred inventory:', error);
                                    setPreferredInventoryIds([]);
                                    applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, client, []);
                                  }
                                }}
                              >
                                <View style={styles.clientDropdownItemContent}>
                                  <Text style={styles.clientDropdownName}>{client.name}</Text>
                                  <Text style={styles.clientDropdownDetails}>
                                    {[
                                      client.lead_type === 'buyer' ? 'Buyer' : 'Tenant',
                                      client.location,
                                      client.budget_max ? `₹${client.budget_max} Cr` : null
                                    ].filter(Boolean).join(' • ')}
                                  </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                      {/* Selected client tag */}
                      {selectedClient && (
                        <View style={styles.selectedClientTag}>
                          <Ionicons name="person" size={14} color="#3B82F6" />
                          <Text style={styles.selectedClientText}>
                            {selectedClient.name} ({selectedClient.lead_type === 'buyer' ? 'Buyer' : 'Tenant'})
                            {preferredInventoryIds.length > 0 ? ` - ${preferredInventoryIds.length} properties` : ' - No saved properties'}
                          </Text>
                          <TouchableOpacity onPress={() => {
                            setSelectedClient(null);
                            setPreferredInventoryIds([]);
                            applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, null, []);
                          }}>
                            <Ionicons name="close-circle" size={16} color="#3B82F6" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Phone and Budget in same row */}
                  <View style={styles.filterRow}>
                    <View style={styles.filterHalf}>
                      <Text style={styles.filterLabel}>{'Phone:'}</Text>
                      <View style={styles.compactInputContainer}>
                        <Ionicons name="call-outline" size={16} color="#6B7280" />
                        <TextInput
                          style={styles.compactInput}
                          placeholder="Search phone..."
                          placeholderTextColor="#9CA3AF"
                          keyboardType="phone-pad"
                          value={phoneFilter}
                          onChangeText={setPhoneFilter}
                          onBlur={handleApplyFilters}
                        />
                        {phoneFilter.length > 0 && (
                          <TouchableOpacity onPress={() => {
                            setPhoneFilter('');
                            handleApplyFilters();
                          }}>
                            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                    <View style={styles.filterHalf}>
                      <Text style={styles.filterLabel}>{'Budget (±10%):'}</Text>
                      <View style={styles.compactInputContainer}>
                        <Ionicons name="cash-outline" size={16} color="#6B7280" />
                        <TextInput
                          style={styles.compactInput}
                          placeholder="e.g. 5000000"
                          placeholderTextColor="#9CA3AF"
                          keyboardType="numeric"
                          value={budgetSearch}
                          onChangeText={setBudgetSearch}
                          onBlur={handleApplyFilters}
                        />
                        {budgetSearch.length > 0 && (
                          <TouchableOpacity onPress={() => {
                            setBudgetSearch('');
                            handleApplyFilters();
                          }}>
                            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Address Filter */}
                  <View style={styles.filterSection}>
                    <Text style={styles.filterLabel}>{'Address:'}</Text>
                    <View style={styles.addressInputContainer}>
                      <Ionicons name="location-outline" size={18} color="#6B7280" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.addressInput}
                        placeholder="Search by address..."
                        placeholderTextColor="#9CA3AF"
                        value={addressFilter}
                        onChangeText={(text) => {
                          setAddressFilter(text);
                        }}
                        onBlur={handleApplyFilters}
                      />
                      {addressFilter.length > 0 && (
                        <TouchableOpacity onPress={() => {
                          setAddressFilter('');
                          handleApplyFilters();
                        }}>
                          <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Location Selector with Inline Search */}
                  <View style={[styles.filterSection, { zIndex: 500 }]}>
                    <Text style={styles.filterLabel}>{'Location:'}</Text>
                    <View style={styles.locationSearchContainer}>
                      <Ionicons name="location-outline" size={18} color="#6B7280" />
                      <TextInput
                        style={styles.locationSearchInput}
                        placeholder="Type to search locations..."
                        placeholderTextColor="#9CA3AF"
                        value={locationSearch}
                        onChangeText={setLocationSearch}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      {locationSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setLocationSearch('')}>
                          <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                        </TouchableOpacity>
                      )}
                    </View>
                    
                    {/* Inline filtered locations dropdown */}
                    {locationSearch.length > 0 && filteredLocations.length > 0 && (
                      <View style={styles.locationDropdown}>
                        <ScrollView style={styles.locationDropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                          {filteredLocations.slice(0, 8).map((loc) => (
                            <TouchableOpacity
                              key={loc}
                              style={[
                                styles.locationDropdownItem,
                                selectedLocations.includes(loc) && styles.locationDropdownItemSelected
                              ]}
                              onPress={() => {
                                // Calculate new locations first, then apply filters with the new state directly
                                const newLocations = selectedLocations.includes(loc)
                                  ? selectedLocations.filter(l => l !== loc)
                                  : [...selectedLocations, loc];
                                setSelectedLocations(newLocations);
                                setLocationSearch('');
                                // Apply filters directly with the updated locations
                                applyFilters(leads, searchQuery, newLocations, selectedFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
                              }}
                            >
                              <Text style={styles.locationDropdownText}>{loc}</Text>
                              {selectedLocations.includes(loc) && (
                                <Ionicons name="checkmark-circle" size={18} color="#3B82F6" />
                              )}
                            </TouchableOpacity>
                          ))}
                          {filteredLocations.length > 8 && (
                            <TouchableOpacity 
                              style={styles.locationDropdownMore}
                              onPress={() => setShowLocationPicker(true)}
                            >
                              <Text style={styles.locationDropdownMoreText}>
                                {`+${filteredLocations.length - 8} more - tap to see all`}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </ScrollView>
                      </View>
                    )}
                    
                    {/* Selected locations tags */}
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

                  {/* Floor Selector with Inline Dropdown */}
                  <View style={[styles.filterSection, { zIndex: 400 }]}>
                    <Text style={styles.filterLabel}>Floor:</Text>
                    <View style={styles.multiSelectContainer}>
                      <TouchableOpacity 
                        style={styles.compactInputContainer}
                        onPress={() => {
                          setShowFloorDropdown(!showFloorDropdown);
                          setShowStatusDropdown(false);
                          setShowFacingDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="layers-outline" size={16} color="#6B7280" />
                        <Text style={[styles.compactInputText, selectedFloors.length === 0 && styles.placeholderText]} numberOfLines={1}>
                          {selectedFloors.length > 0 ? selectedFloors.join(', ') : 'Select floors...'}
                        </Text>
                        {selectedFloors.length > 0 && (
                          <TouchableOpacity onPress={(e) => {
                            e.stopPropagation();
                            setSelectedFloors([]);
                            applyFilters(leads, searchQuery, selectedLocations, [], selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
                          }}>
                            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        )}
                        <Ionicons name={showFloorDropdown ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
                      </TouchableOpacity>
                      {/* Floor dropdown */}
                      {showFloorDropdown && (
                        <View style={styles.multiSelectDropdown}>
                          <ScrollView style={styles.multiSelectDropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {(floorSearch.length > 0 ? filteredFloors : FLOOR_OPTIONS).slice(0, 10).map((floor) => (
                              <TouchableOpacity
                                key={floor}
                                style={[
                                  styles.multiSelectDropdownItem,
                                  selectedFloors.includes(floor) && styles.multiSelectDropdownItemSelected
                                ]}
                                onPress={() => {
                                  const newFloors = selectedFloors.includes(floor)
                                    ? selectedFloors.filter(f => f !== floor)
                                    : [...selectedFloors, floor];
                                  setSelectedFloors(newFloors);
                                  setFloorSearch('');
                                  setShowFloorDropdown(false);
                                  applyFilters(leads, searchQuery, selectedLocations, newFloors, selectedStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
                                }}
                              >
                                <Text style={styles.multiSelectDropdownText}>{floor}</Text>
                                {selectedFloors.includes(floor) && (
                                  <Ionicons name="checkmark-circle" size={18} color="#3B82F6" />
                                )}
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
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

                  {/* Status Selector with Inline Dropdown */}
                  <View style={[styles.filterSection, { zIndex: 300 }]}>
                    <Text style={styles.filterLabel}>Status:</Text>
                    <View style={styles.multiSelectContainer}>
                      <TouchableOpacity 
                        style={styles.compactInputContainer}
                        onPress={() => {
                          setShowStatusDropdown(!showStatusDropdown);
                          setShowFloorDropdown(false);
                          setShowFacingDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="flag-outline" size={16} color="#6B7280" />
                        <Text style={[styles.compactInputText, selectedStatuses.length === 0 && styles.placeholderText]} numberOfLines={1}>
                          {selectedStatuses.length > 0 ? selectedStatuses.join(', ') : 'Select status...'}
                        </Text>
                        {selectedStatuses.length > 0 && (
                          <TouchableOpacity onPress={(e) => {
                            e.stopPropagation();
                            setSelectedStatuses([]);
                            applyFilters(leads, searchQuery, selectedLocations, selectedFloors, [], selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
                          }}>
                            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        )}
                        <Ionicons name={showStatusDropdown ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
                      </TouchableOpacity>
                      {/* Status dropdown */}
                      {showStatusDropdown && (
                        <View style={styles.multiSelectDropdown}>
                          <ScrollView style={styles.multiSelectDropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {(statusSearch.length > 0 ? filteredStatuses : STATUS_OPTIONS).map((status) => (
                              <TouchableOpacity
                                key={status}
                                style={[
                                  styles.multiSelectDropdownItem,
                                  selectedStatuses.includes(status) && styles.multiSelectDropdownItemSelected
                                ]}
                                onPress={() => {
                                  const newStatuses = selectedStatuses.includes(status)
                                    ? selectedStatuses.filter(s => s !== status)
                                    : [...selectedStatuses, status];
                                  setSelectedStatuses(newStatuses);
                                  setStatusSearch('');
                                  setShowStatusDropdown(false);
                                  applyFilters(leads, searchQuery, selectedLocations, selectedFloors, newStatuses, selectedFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
                                }}
                              >
                                <Text style={styles.multiSelectDropdownText}>{status}</Text>
                                {selectedStatuses.includes(status) && (
                                  <Ionicons name="checkmark-circle" size={18} color="#3B82F6" />
                                )}
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Facing Selector with Inline Dropdown */}
                  <View style={[styles.filterSection, { zIndex: 200 }]}>
                    <Text style={styles.filterLabel}>Facing:</Text>
                    <View style={styles.multiSelectContainer}>
                      <TouchableOpacity 
                        style={styles.compactInputContainer}
                        onPress={() => {
                          setShowFacingDropdown(!showFacingDropdown);
                          setShowFloorDropdown(false);
                          setShowStatusDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="compass-outline" size={16} color="#6B7280" />
                        <Text style={[styles.compactInputText, selectedFacings.length === 0 && styles.placeholderText]} numberOfLines={1}>
                          {selectedFacings.length > 0 ? selectedFacings.join(', ') : 'Select facing...'}
                        </Text>
                        {selectedFacings.length > 0 && (
                          <TouchableOpacity onPress={(e) => {
                            e.stopPropagation();
                            setSelectedFacings([]);
                            applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, [], typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
                          }}>
                            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                          </TouchableOpacity>
                        )}
                        <Ionicons name={showFacingDropdown ? "chevron-up" : "chevron-down"} size={18} color="#6B7280" />
                      </TouchableOpacity>
                      {/* Facing dropdown */}
                      {showFacingDropdown && (
                        <View style={styles.multiSelectDropdown}>
                          <ScrollView style={styles.multiSelectDropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {(facingSearch.length > 0 ? filteredFacings : FACING_OPTIONS).map((facing) => (
                              <TouchableOpacity
                                key={facing}
                                style={[
                                  styles.multiSelectDropdownItem,
                                  selectedFacings.includes(facing) && styles.multiSelectDropdownItemSelected
                                ]}
                                onPress={() => {
                                  const newFacings = selectedFacings.includes(facing)
                                    ? selectedFacings.filter(f => f !== facing)
                                    : [...selectedFacings, facing];
                                  setSelectedFacings(newFacings);
                                  setFacingSearch('');
                                  setShowFacingDropdown(false);
                                  applyFilters(leads, searchQuery, selectedLocations, selectedFloors, selectedStatuses, newFacings, typeFilter, areaMin, areaMax, budgetMin, budgetMax, addressFilter, selectedStatTile, phoneFilter, budgetSearch, selectedClient, preferredInventoryIds);
                                }}
                              >
                                <Text style={styles.multiSelectDropdownText}>{facing}</Text>
                                {selectedFacings.includes(facing) && (
                                  <Ionicons name="checkmark-circle" size={18} color="#3B82F6" />
                                )}
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    marginBottom: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  filterHalf: {
    flex: 1,
  },
  compactInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  compactInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    padding: 0,
  },
  compactInputText: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
  },
  filterSection: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
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
  locationSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  locationSearchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
    padding: 0,
  },
  locationPickerBtn: {
    padding: 4,
  },
  locationDropdown: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationDropdownScroll: {
    maxHeight: 220,
  },
  locationDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  locationDropdownItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  locationDropdownText: {
    fontSize: 15,
    color: '#1F2937',
  },
  locationDropdownMore: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
  },
  locationDropdownMoreText: {
    fontSize: 13,
    color: '#3B82F6',
    textAlign: 'center',
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
    gap: 8,
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
    minWidth: 0,
  },
  rangeSeparator: {
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
  agingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  agingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  agingText: {
    fontSize: 12,
    fontWeight: '600',
  },
  tempBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
    marginLeft: 'auto',
  },
  tempDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tempText: {
    fontSize: 12,
    fontWeight: '600',
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
  linkText: {
    color: '#3B82F6',
    textDecorationLine: 'underline',
  },
  whatsappButton: {
    padding: 4,
    marginLeft: 8,
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
    fontSize: 12,
    color: '#059669',
    marginLeft: 6,
    fontWeight: '500',
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
  floorTag: {
    backgroundColor: '#EEF2FF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  facingTag: {
    backgroundColor: '#ECFEFF',
    flexDirection: 'row',
    alignItems: 'center',
  },
  amenitiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
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
  searchResultCount: {
    fontSize: 13,
    color: '#6B7280',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  emptySearchResult: {
    padding: 32,
    alignItems: 'center',
  },
  emptySearchText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  modalList: {
    flex: 1,
    maxHeight: 350,
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
  addressInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  addressInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    paddingVertical: 0,
  },
  fileUploadRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  // Client dropdown styles
  clientDropdownContainer: {
    position: 'relative',
  },
  clientDropdown: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
  },
  clientDropdownScroll: {
    maxHeight: 200,
  },
  clientDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  clientDropdownItemContent: {
    flex: 1,
  },
  clientDropdownName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  clientDropdownDetails: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  selectedClientTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  selectedClientText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  // Multi-select dropdown styles
  multiSelectContainer: {
    position: 'relative',
    zIndex: 100,
  },
  multiSelectDropdown: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  multiSelectDropdownScroll: {
    maxHeight: 180,
  },
  multiSelectDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  multiSelectDropdownItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  multiSelectDropdownText: {
    fontSize: 14,
    color: '#1F2937',
  },
});
