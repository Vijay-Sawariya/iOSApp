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
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineApi } from '../../services/offlineApi';
import { router, useFocusEffect } from 'expo-router';
import { useOffline } from '../../contexts/OfflineContext';
import { useAuth } from '../../contexts/AuthContext';
import { 
  LOCATIONS, 
  FLOORS, 
  LEAD_SOURCES, 
  normalizeSearchText, 
  canViewSensitiveData, 
  maskPhone, 
  maskAddress,
  getAgingStyles,
} from '../../constants/leadOptions';
import { SafeAreaView } from 'react-native-safe-area-context';
import MatchingLeadsModal from '../../components/MatchingLeadsModal';
import { buildBuyerFollowupMessage, openWhatsapp } from '../../utils/whatsappMessages';

interface Lead {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  lead_type: string | null;
  lead_temperature: string | null;
  lead_status: string | null;
  lead_source: string | null;
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
  created_by?: number | null;  // ID of the user who created this lead
  created_by_name?: string | null;
  // Action/Followup fields
  next_action_date?: string | null;
  next_action_time?: string | null;
  next_action_title?: string | null;
  next_action_status?: string | null;
  // Lead Scoring fields
  lead_score?: number | null;
  days_since_contact?: number | null;
  aging_label?: string | null;
  aging_color?: string | null;
  aging_urgency?: string | null;
  score_breakdown?: Array<[string, number, string]> | null;
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
  const [leadSourceFilter, setLeadSourceFilter] = useState<string | null>(null);
  const [showClosedLost, setShowClosedLost] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'date' | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const { isOnline } = useOffline();
  const { user } = useAuth();
  
  // Location/Floor filter states
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedFloors, setSelectedFloors] = useState<string[]>([]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showFloorPicker, setShowFloorPicker] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [floorSearch, setFloorSearch] = useState('');
  const [showFloorDropdown, setShowFloorDropdown] = useState(false);
  const [selectedStatTile, setSelectedStatTile] = useState<string>('total'); // 'total', 'buyer', 'tenant'
  const [phoneFilter, setPhoneFilter] = useState('');
  const [budgetSearch, setBudgetSearch] = useState(''); // Budget with +/- 10%
  const [matchingLead, setMatchingLead] = useState<Lead | null>(null);

  // Share WhatsApp message (matching PHP ShareMessage function)
  const handleWhatsAppShare = (phoneNumber: string) => {
    const senderName = user?.full_name || 'Team';
    openWhatsapp(phoneNumber, buildBuyerFollowupMessage(senderName));
  };

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
      applyFilters(data, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch);
    } catch (error) {
      console.error('Failed to load client leads:', error);
    }
  };

  // Use a ref to track if we should reload on focus
  const loadLeadsRef = React.useRef(loadLeads);
  loadLeadsRef.current = loadLeads;

  useFocusEffect(
    useCallback(() => {
      loadLeadsRef.current();
    }, [])
  );

  const applyFilters = (
    data: Lead[], 
    search: string, 
    temp: string | null, 
    sort: 'name' | 'date' | null,
    locations: string[] = selectedLocations,
    floors: string[] = selectedFloors,
    statTile: string = selectedStatTile,
    phone: string = phoneFilter,
    budgetSrch: string = budgetSearch,
    sourceFilter: string | null = leadSourceFilter,
    closedLost: boolean = showClosedLost
  ) => {
    let filtered = [...data];

    // Filter by Closed/Lost status
    // If showClosedLost is true, show ONLY Closed/Lost leads
    // If showClosedLost is false (default), hide Closed/Lost leads
    if (closedLost) {
      filtered = filtered.filter((lead) => lead.lead_status === 'Closed/Lost' || lead.lead_status === 'Lost');
    } else {
      filtered = filtered.filter((lead) => lead.lead_status !== 'Closed/Lost' && lead.lead_status !== 'Lost');
    }

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

    // Phone filter (dedicated filter field)
    if (phone) {
      const normalizedPhone = phone.replace(/[^0-9]/g, '');
      filtered = filtered.filter((lead) => {
        const leadPhone = (lead.phone || '').replace(/[^0-9]/g, '');
        return leadPhone.includes(normalizedPhone);
      });
    }

    // Budget search with +/- 10% range (for clients, use budget_min/budget_max)
    if (budgetSrch) {
      const searchBudget = parseFloat(budgetSrch);
      if (!isNaN(searchBudget)) {
        const budgetMinVal = searchBudget * 0.9; // -10%
        const budgetMaxVal = searchBudget * 1.1; // +10%
        
        filtered = filtered.filter((lead) => {
          const leadBudgetMin = lead.budget_min || 0;
          const leadBudgetMax = lead.budget_max || Infinity;
          
          // Check if lead's budget range overlaps with search range
          return leadBudgetMax >= budgetMinVal && leadBudgetMin <= budgetMaxVal;
        });
      }
    }

    // Temperature filter (Hot, Warm, Cold)
    if (temp) {
      filtered = filtered.filter((lead) => lead.lead_temperature === temp);
    }
    
    // Lead Source filter
    if (sourceFilter) {
      filtered = filtered.filter((lead) => lead.lead_source === sourceFilter);
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
    applyFilters(leads, searchQuery, temp, sortBy, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch, leadSourceFilter, showClosedLost);
  };

  const handleLeadSourceFilter = (source: string | null) => {
    setLeadSourceFilter(source);
    applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch, source, showClosedLost);
  };

  const handleClosedLostFilter = () => {
    const newValue = !showClosedLost;
    setShowClosedLost(newValue);
    // When toggling Closed/Lost, clear temperature filter since they're mutually exclusive views
    if (newValue) {
      setTemperatureFilter(null);
    }
    applyFilters(leads, searchQuery, newValue ? null : temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch, leadSourceFilter, newValue);
  };

  const handleSort = (sort: 'name' | 'date' | null) => {
    setSortBy(sort);
    applyFilters(leads, searchQuery, temperatureFilter, sort, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch, leadSourceFilter, showClosedLost);
  };

  const handleStatTileClick = (tile: string) => {
    setSelectedStatTile(tile);
    applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, tile, phoneFilter, budgetSearch, leadSourceFilter, showClosedLost);
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
    applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch, leadSourceFilter, showClosedLost);
  };

  const hasActiveFilters = () => {
    return temperatureFilter !== null || leadSourceFilter !== null || showClosedLost || sortBy !== null || selectedLocations.length > 0 || selectedFloors.length > 0 || selectedStatTile !== 'total';
  };

  const clearAllFilters = () => {
    setTemperatureFilter(null);
    setLeadSourceFilter(null);
    setShowClosedLost(false);
    setSortBy(null);
    setSelectedLocations([]);
    setSelectedFloors([]);
    setSearchQuery('');
    setSelectedStatTile('total');
    applyFilters(leads, '', null, null, [], [], 'total', '', '', null, false);
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

  // Helper function to format and check followup status
  const getFollowupStatus = (item: Lead) => {
    if (!item.next_action_date) return null;
    
    const now = new Date();
    const actionDate = new Date(item.next_action_date);
    
    // If we have time, add it to the action date for precise comparison
    if (item.next_action_time) {
      const [hours, minutes] = item.next_action_time.split(':');
      actionDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      actionDate.setHours(23, 59, 59, 999); // End of day if no time specified
    }
    
    // Format date
    const dateStr = actionDate.toLocaleDateString('en-IN', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
    
    // Format time if available
    let timeStr = '';
    if (item.next_action_time) {
      const [hours, minutes] = item.next_action_time.split(':');
      const hour = parseInt(hours);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      timeStr = ` ${hour12}:${minutes} ${ampm}`;
    }
    
    // Check if date/time has passed AND status is Pending
    const isPassed = now > actionDate;
    const isPending = item.next_action_status === 'Pending';
    
    if (isPassed && isPending) {
      return { type: 'missed', label: `Missed: ${dateStr}${timeStr}` };
    } else {
      return { type: 'upcoming', label: `Upcoming: ${dateStr}${timeStr}` };
    }
  };

  const renderLead = ({ item }: { item: Lead }) => {
    const budgetText = formatBudget(item);
    const typeColor = getLeadTypeColor(item.lead_type);
    const isHot = item.lead_temperature === 'Hot';
    
    // Check if user can view sensitive data for this lead
    const canViewData = canViewSensitiveData(user?.role, user?.id, item.created_by);
    
    // Determine what to display for phone (location is visible to everyone)
    const displayPhone = canViewData ? item.phone : maskPhone(item.phone);
    
    // Get followup status
    const followupStatus = getFollowupStatus(item);
    
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
          <View style={[styles.tempBadge, { backgroundColor: getTemperatureColor(item.lead_temperature) + '20' }]}>
            <View style={[styles.tempDot, { backgroundColor: getTemperatureColor(item.lead_temperature) }]} />
            <Text style={[styles.tempText, { color: getTemperatureColor(item.lead_temperature) }]}>
              {item.lead_temperature || 'N/A'}
            </Text>
          </View>
        </View>
        
        {/* Missed/Due Followup Banner */}
        {followupStatus && (
          <View style={[
            styles.followupBanner,
            followupStatus.type === 'missed' ? styles.followupMissed : styles.followupUpcoming,
          ]}>
            <Ionicons 
              name={followupStatus.type === 'missed' ? "warning" : "time-outline"} 
              size={14} 
              color={followupStatus.type === 'missed' ? "#DC2626" : "#059669"} 
            />
            <Text style={[
              styles.followupText,
              followupStatus.type === 'missed' ? styles.followupTextMissed : styles.followupTextUpcoming,
            ]}>
              {followupStatus.label}
            </Text>
          </View>
        )}
        
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
              {item.lead_source && (
                <Text style={styles.createdByText}>Source: {item.lead_source}</Text>
              )}
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
                    onPress={() => handleWhatsAppShare(item.phone || '')}
                  >
                    <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                  </TouchableOpacity>
                </>
              )}
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

        {/* Action Buttons Row - Edit/Delete only visible if user has permission */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setMatchingLead(item)}
          >
            <Ionicons name="git-compare-outline" size={18} color="#2563EB" />
            <Text style={[styles.actionText, { color: '#2563EB' }]}>Matches</Text>
          </TouchableOpacity>
          <View style={styles.actionDivider} />
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
                    onBlur={() => applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch)}
                  />
                  {phoneFilter.length > 0 && (
                    <TouchableOpacity onPress={() => {
                      setPhoneFilter('');
                      applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile, '', budgetSearch);
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
                    onBlur={() => applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch)}
                  />
                  {budgetSearch.length > 0 && (
                    <TouchableOpacity onPress={() => {
                      setBudgetSearch('');
                      applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, selectedFloors, selectedStatTile, phoneFilter, '');
                    }}>
                      <Ionicons name="close-circle" size={16} color="#9CA3AF" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Location Selector with Inline Search */}
            <View style={styles.filterSection}>
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
                          applyFilters(leads, searchQuery, temperatureFilter, sortBy, newLocations, selectedFloors, selectedStatTile, phoneFilter, budgetSearch);
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

            {/* Floor Selector with Inline Dropdown */}
            <View style={[styles.filterSection, { zIndex: 400 }]}>
              <Text style={styles.filterLabel}>Floor Preference:</Text>
              <View style={styles.multiSelectContainer}>
                <TouchableOpacity 
                  style={styles.compactInputContainer}
                  onPress={() => setShowFloorDropdown(!showFloorDropdown)}
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
                      applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, [], selectedStatTile, phoneFilter, budgetSearch);
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
                      {FLOOR_OPTIONS.slice(0, 10).map((floor) => (
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
                            setShowFloorDropdown(false);
                            applyFilters(leads, searchQuery, temperatureFilter, sortBy, selectedLocations, newFloors, selectedStatTile, phoneFilter, budgetSearch);
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
                {/* Closed/Lost - filters by status, not temperature */}
                <TouchableOpacity
                  style={[
                    styles.filterChip,
                    showClosedLost && styles.filterChipActive,
                    { backgroundColor: showClosedLost ? '#6B7280' : '#F3F4F6' }
                  ]}
                  onPress={handleClosedLostFilter}
                >
                  <Text style={[
                    styles.filterChipText,
                    showClosedLost && styles.filterChipTextActive
                  ]}>Closed/Lost</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Lead Source Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Lead Source:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterOptionsScroll}>
                <View style={styles.filterOptions}>
                  {LEAD_SOURCES.map((source) => (
                    <TouchableOpacity
                      key={source}
                      style={[
                        styles.filterChip,
                        leadSourceFilter === source && styles.filterChipActive,
                        { backgroundColor: leadSourceFilter === source ? '#8B5CF6' : '#F3F4F6' }
                      ]}
                      onPress={() => handleLeadSourceFilter(leadSourceFilter === source ? null : source)}
                    >
                      <Text style={[
                        styles.filterChipText,
                        leadSourceFilter === source && styles.filterChipTextActive
                      ]}>{source}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
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
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{'Select Locations'}</Text>
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
                autoCapitalize="none"
                autoCorrect={false}
              />
              {locationSearch.length > 0 && (
                <TouchableOpacity onPress={() => setLocationSearch('')}>
                  <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
            {locationSearch.length > 0 && (
              <Text style={styles.searchResultCount}>
                {filteredLocations.length} {filteredLocations.length === 1 ? 'result' : 'results'} found
              </Text>
            )}
            <FlatList
              data={filteredLocations}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
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
              ListEmptyComponent={
                <View style={styles.emptySearchResult}>
                  <Text style={styles.emptySearchText}>{'No results found'}</Text>
                </View>
              }
            />
            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => {
                setShowLocationPicker(false);
                handleApplyLocationFloorFilters();
              }}
            >
              <Text style={styles.modalDoneBtnText}>{`Done (${selectedLocations.length} selected)`}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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

      <MatchingLeadsModal
        visible={!!matchingLead}
        lead={matchingLead}
        mode="inventory"
        onClose={() => setMatchingLead(null)}
        onSaved={loadLeads}
      />
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
  followupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  followupMissed: {
    backgroundColor: '#FEE2E2',
  },
  followupUpcoming: {
    backgroundColor: '#D1FAE5',
  },
  followupText: {
    fontSize: 12,
    fontWeight: '600',
  },
  followupTextMissed: {
    color: '#DC2626',
  },
  followupTextUpcoming: {
    color: '#059669',
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
  },
  whatsappButton: {
    padding: 4,
    marginLeft: 8,
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
    maxHeight: 400,
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
  placeholderText: {
    color: '#9CA3AF',
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
  filterOptionsScroll: {
    marginBottom: 4,
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
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  phoneInput: {
    flex: 1,
    fontSize: 15,
    color: '#1F2937',
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
