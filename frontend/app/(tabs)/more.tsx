import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  FlatList,
  Linking,
  Platform,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { LOCATIONS } from '../../constants/leadOptions';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface SiteVisit {
  id: number;
  lead_id: number;
  lead_name: string;
  lead_phone: string;
  property_name: string;
  property_location: string;
  visit_date: string;
  visit_time: string;
  location: string;
  notes: string;
  status: string;
}

interface Deal {
  id: number;
  lead_id: number;
  lead_name: string;
  property_name: string;
  property_location: string;
  deal_amount: number;
  commission_percent: number;
  commission_amount: number;
  status: string;
  payment_received: number;
  expected_closing_date: string;
}

interface TeamMember {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  lead_count: number;
  can_export?: boolean;
}

interface ActivityLog {
  id: number;
  lead_id: number;
  lead_name: string;
  action_type: string;
  description: string;
  created_by: string;
  created_at: string;
}

import { useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

// Time options for dropdown
const TIME_OPTIONS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00'
];

export default function MoreScreen() {
  const { user, token } = useAuth();
  const params = useLocalSearchParams();
  const initialTab = (params.tab as string) || 'visits';
  const fromPopup = params.fromPopup === 'true';
  const [activeTab, setActiveTab] = useState<'visits' | 'deals' | 'team' | 'activity' | 'export'>(
    initialTab as any
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Date/Time picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // Update active tab when params change
  useEffect(() => {
    if (params.tab) {
      setActiveTab(params.tab as any);
    }
  }, [params.tab]);
  
  // Data states
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [canExport, setCanExport] = useState(false);
  
  // Modal states
  const [showAddVisitModal, setShowAddVisitModal] = useState(false);
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  
  // Lead search states for Site Visit
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [leadSearchResults, setLeadSearchResults] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [showLeadDropdown, setShowLeadDropdown] = useState(false);
  
  // Lead search states for Deal
  const [dealLeadSearchQuery, setDealLeadSearchQuery] = useState('');
  const [dealLeadSearchResults, setDealLeadSearchResults] = useState<any[]>([]);
  const [selectedDealLead, setSelectedDealLead] = useState<any>(null);
  const [showDealLeadDropdown, setShowDealLeadDropdown] = useState(false);
  
  // Location dropdown state
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [filteredLocations, setFilteredLocations] = useState<string[]>(LOCATIONS);
  
  // Form states
  const [visitForm, setVisitForm] = useState({
    lead_id: '',
    lead_name: '',
    visit_date: '',
    visit_time: '',
    location: '',
    notes: '',
  });
  
  const [dealForm, setDealForm] = useState({
    lead_id: '',
    lead_name: '',
    deal_amount: '',
    commission_percent: '',
    expected_closing_date: '',
    notes: '',
  });

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
      // Fetch user permissions
      const permRes = await fetch(`${API_URL}/api/user/permissions`, { headers });
      if (permRes.ok) {
        const permData = await permRes.json();
        setCanExport(permData.can_export || permData.is_admin);
      }
      
      // Fetch site visits
      const visitsRes = await fetch(`${API_URL}/api/site-visits`, { headers });
      if (visitsRes.ok) {
        const visitsData = await visitsRes.json();
        setSiteVisits(visitsData);
      }
      
      // Fetch deals
      const dealsRes = await fetch(`${API_URL}/api/deals`, { headers });
      if (dealsRes.ok) {
        const dealsData = await dealsRes.json();
        setDeals(dealsData);
      }
      
      // Fetch team members (admin only)
      if (user?.role === 'admin') {
        const teamRes = await fetch(`${API_URL}/api/team/members-with-permissions`, { headers });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          setTeamMembers(teamData);
        }
      }
      
      // Fetch activity logs
      const activityRes = await fetch(`${API_URL}/api/activity-logs`, { headers });
      if (activityRes.ok) {
        const activityData = await activityRes.json();
        setActivityLogs(activityData);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [token])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Search leads as user types
  const searchLeads = async (query: string) => {
    setLeadSearchQuery(query);
    if (query.length < 2) {
      setLeadSearchResults([]);
      setShowLeadDropdown(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/leads/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const results = await response.json();
        setLeadSearchResults(results);
        setShowLeadDropdown(results.length > 0);
      }
    } catch (error) {
      console.error('Lead search error:', error);
    }
  };
  
  // Select a lead from search results
  const selectLead = (lead: any) => {
    setSelectedLead(lead);
    setVisitForm({ 
      ...visitForm, 
      lead_id: lead.id.toString(), 
      lead_name: lead.name 
    });
    setLeadSearchQuery(lead.name);
    setShowLeadDropdown(false);
  };
  
  // Filter locations as user types
  const filterLocations = (query: string) => {
    setVisitForm({ ...visitForm, location: query });
    if (query.length === 0) {
      setFilteredLocations(LOCATIONS);
    } else {
      const filtered = LOCATIONS.filter(loc => 
        loc.toLowerCase().includes(query.toLowerCase())
      );
      setFilteredLocations(filtered);
    }
    setShowLocationDropdown(true);
  };
  
  // Select a location
  const selectLocation = (location: string) => {
    setVisitForm({ ...visitForm, location });
    setShowLocationDropdown(false);
  };

  // Search leads for Deal
  const searchDealLeads = async (query: string) => {
    setDealLeadSearchQuery(query);
    if (query.length < 2) {
      setDealLeadSearchResults([]);
      setShowDealLeadDropdown(false);
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/leads/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const results = await response.json();
        setDealLeadSearchResults(results);
        setShowDealLeadDropdown(results.length > 0);
      }
    } catch (error) {
      console.error('Deal lead search error:', error);
    }
  };
  
  // Select a lead for Deal
  const selectDealLead = (lead: any) => {
    setSelectedDealLead(lead);
    setDealForm({ 
      ...dealForm, 
      lead_id: lead.id.toString(), 
      lead_name: lead.name 
    });
    setDealLeadSearchQuery(lead.name);
    setShowDealLeadDropdown(false);
  };

  // Handle date picker change
  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (date) {
      setSelectedDate(date);
      const formattedDate = date.toISOString().split('T')[0];
      setVisitForm({ ...visitForm, visit_date: formattedDate });
    }
  };

  const handleAddVisit = async () => {
    if (!visitForm.lead_id || !visitForm.visit_date) {
      Alert.alert('Error', 'Please fill in required fields');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/site-visits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lead_id: parseInt(visitForm.lead_id),
          visit_date: visitForm.visit_date,
          visit_time: visitForm.visit_time || null,
          location: visitForm.location,
          notes: visitForm.notes,
        }),
      });
      
      if (response.ok) {
        Alert.alert('Success', 'Site visit scheduled');
        setShowAddVisitModal(false);
        setVisitForm({ lead_id: '', visit_date: '', visit_time: '', location: '', notes: '' });
        fetchData();
      } else {
        Alert.alert('Error', 'Failed to schedule visit');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to schedule visit');
    }
  };

  const handleAddDeal = async () => {
    if (!dealForm.lead_id || !dealForm.deal_amount) {
      Alert.alert('Error', 'Please fill in required fields');
      return;
    }
    
    try {
      const response = await fetch(`${API_URL}/api/deals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          lead_id: parseInt(dealForm.lead_id),
          deal_amount: parseFloat(dealForm.deal_amount),
          commission_percent: dealForm.commission_percent ? parseFloat(dealForm.commission_percent) : null,
          expected_closing_date: dealForm.expected_closing_date || null,
          notes: dealForm.notes,
        }),
      });
      
      if (response.ok) {
        Alert.alert('Success', 'Deal created');
        setShowAddDealModal(false);
        setDealForm({ lead_id: '', deal_amount: '', commission_percent: '', expected_closing_date: '', notes: '' });
        fetchData();
      } else {
        Alert.alert('Error', 'Failed to create deal');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create deal');
    }
  };

  const updateVisitStatus = async (visitId: number, status: string) => {
    try {
      const response = await fetch(`${API_URL}/api/site-visits/${visitId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Update error:', error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Scheduled': return '#3B82F6';
      case 'Completed': return '#10B981';
      case 'Cancelled': return '#EF4444';
      case 'Rescheduled': return '#F59E0B';
      case 'Negotiation': return '#8B5CF6';
      case 'Agreement': return '#3B82F6';
      case 'Documentation': return '#F59E0B';
      case 'Payment': return '#10B981';
      case 'Closed': return '#059669';
      default: return '#6B7280';
    }
  };

  // Export Functions
  const exportLeads = async (leadType: 'clients' | 'inventory' | 'all') => {
    setExporting(true);
    try {
      const endpoint = leadType === 'all' ? '/api/leads' : `/api/leads/${leadType}`;
      const response = await fetch(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch leads');
      
      const leads = await response.json();
      
      // Create CSV content
      const headers = ['ID', 'Name', 'Phone', 'Email', 'Lead Type', 'Status', 'Temperature', 'Budget', 'Location', 'Property Type', 'Created At'];
      const csvRows = [headers.join(',')];
      
      for (const lead of leads) {
        const row = [
          lead.id || '',
          `"${(lead.name || '').replace(/"/g, '""')}"`,
          lead.phone || '',
          lead.email || '',
          lead.lead_type || '',
          lead.lead_status || '',
          lead.temperature || '',
          `${lead.budget_min || ''}-${lead.budget_max || ''}`,
          `"${(lead.location || '').replace(/"/g, '""')}"`,
          lead.property_type || '',
          lead.created_at || ''
        ];
        csvRows.push(row.join(','));
      }
      
      const csvContent = csvRows.join('\n');
      const fileName = `leads_${leadType}_${new Date().toISOString().split('T')[0]}.csv`;
      
      if (Platform.OS === 'web') {
        // Web download
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('Success', `Exported ${leads.length} leads`);
      } else {
        // Mobile - save and share
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Leads' });
        } else {
          Alert.alert('Success', `Saved to ${fileUri}`);
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export leads');
    } finally {
      setExporting(false);
    }
  };

  const exportDeals = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API_URL}/api/deals`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch deals');
      
      const deals_data = await response.json();
      
      const headers = ['ID', 'Lead Name', 'Property', 'Deal Amount', 'Commission %', 'Status', 'Expected Close Date'];
      const csvRows = [headers.join(',')];
      
      for (const deal of deals_data) {
        const row = [
          deal.id || '',
          `"${(deal.lead_name || '').replace(/"/g, '""')}"`,
          `"${(deal.property_name || '').replace(/"/g, '""')}"`,
          deal.deal_amount || '',
          deal.commission_percent || '',
          deal.status || '',
          deal.expected_closing_date || ''
        ];
        csvRows.push(row.join(','));
      }
      
      const csvContent = csvRows.join('\n');
      const fileName = `deals_${new Date().toISOString().split('T')[0]}.csv`;
      
      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('Success', `Exported ${deals_data.length} deals`);
      } else {
        const fileUri = FileSystem.documentDirectory + fileName;
        await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
        
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: 'Export Deals' });
        } else {
          Alert.alert('Success', `Saved to ${fileUri}`);
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export deals');
    } finally {
      setExporting(false);
    }
  };

  const renderSiteVisit = ({ item }: { item: SiteVisit }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>{item.lead_name || `Lead #${item.lead_id}`}</Text>
          <Text style={styles.cardSubtitle}>{item.location || item.property_location || 'No location'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.infoRow}>
          <Ionicons name="calendar" size={16} color="#6B7280" />
          <Text style={styles.infoText}>{item.visit_date} {item.visit_time ? `at ${item.visit_time}` : ''}</Text>
        </View>
        {item.notes && (
          <Text style={styles.notesText}>{item.notes}</Text>
        )}
      </View>
      <View style={styles.cardActions}>
        {item.lead_phone && (
          <>
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${item.lead_phone}`)}>
              <Ionicons name="call" size={18} color="#10B981" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`whatsapp://send?phone=91${item.lead_phone.replace(/\D/g, '')}`)}>
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
          </>
        )}
        {item.status === 'Scheduled' && (
          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#D1FAE5' }]} 
            onPress={() => updateVisitStatus(item.id, 'Completed')}
          >
            <Ionicons name="checkmark" size={18} color="#059669" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderDeal = ({ item }: { item: Deal }) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/leads/${item.lead_id}` as any)}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>{item.lead_name || `Lead #${item.lead_id}`}</Text>
          <Text style={styles.cardSubtitle}>{item.property_location || 'Property Deal'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.dealStats}>
          <View style={styles.dealStat}>
            <Text style={styles.dealStatLabel}>Deal Value</Text>
            <Text style={styles.dealStatValue}>₹{item.deal_amount} Cr</Text>
          </View>
          <View style={styles.dealStat}>
            <Text style={styles.dealStatLabel}>Commission</Text>
            <Text style={styles.dealStatValue}>₹{item.commission_amount || '-'}</Text>
          </View>
          <View style={styles.dealStat}>
            <Text style={styles.dealStatLabel}>Received</Text>
            <Text style={[styles.dealStatValue, { color: '#10B981' }]}>₹{item.payment_received || 0}</Text>
          </View>
        </View>
        {item.expected_closing_date && (
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={16} color="#6B7280" />
            <Text style={styles.infoText}>Expected: {item.expected_closing_date}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  // Toggle export permission for a user
  const toggleExportPermission = async (userId: number, currentValue: boolean) => {
    try {
      const response = await fetch(`${API_URL}/api/user/${userId}/permissions?can_export=${!currentValue}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        // Update the local state
        setTeamMembers(prev => prev.map(m => 
          m.id === userId ? { ...m, can_export: !currentValue } : m
        ));
        Alert.alert('Success', `Export permission ${!currentValue ? 'granted' : 'revoked'}`);
      } else {
        Alert.alert('Error', 'Failed to update permission');
      }
    } catch (error) {
      console.error('Permission update error:', error);
      Alert.alert('Error', 'Failed to update permission');
    }
  };

  const renderTeamMember = ({ item }: { item: TeamMember }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: item.role === 'admin' ? '#6366F1' : '#3B82F6' }]}>
            <Text style={styles.avatarText}>{(item.full_name || item.username || 'U')[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.cardTitle}>{item.full_name || item.username}</Text>
            <Text style={styles.cardSubtitle}>{item.email}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: item.role === 'admin' ? '#EEF2FF' : '#F3F4F6' }]}>
          <Text style={[styles.statusText, { color: item.role === 'admin' ? '#6366F1' : '#6B7280' }]}>{item.role}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.teamStatsRow}>
          <View style={styles.teamStat}>
            <Text style={styles.teamStatValue}>{item.lead_count || 0}</Text>
            <Text style={styles.teamStatLabel}>Leads</Text>
          </View>
          {item.role !== 'admin' && (
            <TouchableOpacity 
              style={[
                styles.permissionToggle, 
                item.can_export && styles.permissionToggleActive
              ]}
              onPress={() => toggleExportPermission(item.id, item.can_export || false)}
            >
              <Ionicons 
                name={item.can_export ? 'checkmark-circle' : 'close-circle'} 
                size={18} 
                color={item.can_export ? '#10B981' : '#9CA3AF'} 
              />
              <Text style={[
                styles.permissionToggleText,
                item.can_export && styles.permissionToggleTextActive
              ]}>
                Export
              </Text>
            </TouchableOpacity>
          )}
          {item.role === 'admin' && (
            <View style={styles.adminBadge}>
              <Ionicons name="shield-checkmark" size={16} color="#6366F1" />
              <Text style={styles.adminBadgeText}>Full Access</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );

  const getActivityIcon = (actionType: string) => {
    switch (actionType?.toLowerCase()) {
      case 'call': return 'call';
      case 'whatsapp': return 'logo-whatsapp';
      case 'email': return 'mail';
      case 'visit': return 'location';
      case 'meeting': return 'people';
      case 'note': return 'document-text';
      case 'status_change': return 'swap-horizontal';
      case 'deal': return 'cash';
      default: return 'time';
    }
  };

  const getActivityColor = (actionType: string) => {
    switch (actionType?.toLowerCase()) {
      case 'call': return '#3B82F6';
      case 'whatsapp': return '#25D366';
      case 'email': return '#EF4444';
      case 'visit': return '#F59E0B';
      case 'meeting': return '#8B5CF6';
      case 'deal': return '#10B981';
      default: return '#6B7280';
    }
  };

  const formatActivityDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const renderActivityLog = ({ item }: { item: ActivityLog }) => (
    <View style={styles.activityCard}>
      <View style={[styles.activityIcon, { backgroundColor: getActivityColor(item.action_type) + '20' }]}>
        <Ionicons name={getActivityIcon(item.action_type) as any} size={18} color={getActivityColor(item.action_type)} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityTitle}>{item.description || item.action_type}</Text>
        <View style={styles.activityMeta}>
          {item.lead_name && (
            <TouchableOpacity onPress={() => router.push(`/leads/${item.lead_id}` as any)}>
              <Text style={styles.activityLead}>{item.lead_name}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.activityTime}>{formatActivityDate(item.created_at)}</Text>
        </View>
        {item.created_by && (
          <Text style={styles.activityUser}>by {item.created_by}</Text>
        )}
      </View>
    </View>
  );

  // Render modals (shared between both views)
  const renderModals = () => (
    <>
      {/* Add Site Visit Modal */}
      <Modal visible={showAddVisitModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Site Visit</Text>
              <TouchableOpacity onPress={() => {
                setShowAddVisitModal(false);
                setLeadSearchQuery('');
                setLeadSearchResults([]);
                setShowLeadDropdown(false);
                setShowLocationDropdown(false);
                setShowDatePicker(false);
                setShowTimePicker(false);
              }}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Lead *</Text>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.input}
                  value={leadSearchQuery}
                  onChangeText={searchLeads}
                  placeholder="Search lead by name or phone..."
                  onFocus={() => leadSearchResults.length > 0 && setShowLeadDropdown(true)}
                />
                {selectedLead && (
                  <TouchableOpacity 
                    style={styles.clearButton}
                    onPress={() => {
                      setSelectedLead(null);
                      setLeadSearchQuery('');
                      setVisitForm({ ...visitForm, lead_id: '', lead_name: '' });
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
              {showLeadDropdown && leadSearchResults.length > 0 && (
                <View style={styles.dropdownContainer}>
                  {leadSearchResults.slice(0, 5).map((lead) => (
                    <TouchableOpacity
                      key={lead.id}
                      style={styles.dropdownItem}
                      onPress={() => selectLead(lead)}
                    >
                      <View>
                        <Text style={styles.dropdownItemText}>{lead.name}</Text>
                        <Text style={styles.dropdownItemSubtext}>{lead.phone} • {lead.lead_type}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {selectedLead && (
                <View style={styles.selectedLeadCard}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={styles.selectedLeadText}>
                    {selectedLead.name} ({selectedLead.phone})
                  </Text>
                </View>
              )}
              
              <Text style={styles.inputLabel}>Visit Date *</Text>
              {Platform.OS === 'web' ? (
                <TextInput
                  style={styles.input}
                  value={visitForm.visit_date}
                  onChangeText={(text) => setVisitForm({ ...visitForm, visit_date: text })}
                  placeholder="YYYY-MM-DD (e.g., 2026-05-15)"
                />
              ) : (
                <>
                  <TouchableOpacity 
                    style={styles.datePickerButton}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Ionicons name="calendar" size={20} color="#6B7280" />
                    <Text style={[styles.datePickerText, !visitForm.visit_date && styles.placeholderText]}>
                      {visitForm.visit_date || 'Select date'}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleDateChange}
                      minimumDate={new Date()}
                    />
                  )}
                </>
              )}
              
              <Text style={styles.inputLabel}>Visit Time</Text>
              <TouchableOpacity 
                style={styles.datePickerButton}
                onPress={() => setShowTimePicker(!showTimePicker)}
              >
                <Ionicons name="time" size={20} color="#6B7280" />
                <Text style={[styles.datePickerText, !visitForm.visit_time && styles.placeholderText]}>
                  {visitForm.visit_time || 'Select time'}
                </Text>
              </TouchableOpacity>
              {showTimePicker && (
                <View style={[styles.dropdownContainer, { maxHeight: 200 }]}>
                  <ScrollView nestedScrollEnabled>
                    {TIME_OPTIONS.map((time, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[styles.dropdownItem, visitForm.visit_time === time && styles.dropdownItemSelected]}
                        onPress={() => {
                          setVisitForm({ ...visitForm, visit_time: time });
                          setShowTimePicker(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, visitForm.visit_time === time && styles.dropdownItemTextSelected]}>
                          {time}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              
              <Text style={styles.inputLabel}>Location</Text>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.input}
                  value={visitForm.location}
                  onChangeText={filterLocations}
                  placeholder="Search or select location..."
                  onFocus={() => setShowLocationDropdown(true)}
                />
                {visitForm.location && (
                  <TouchableOpacity 
                    style={styles.clearButton}
                    onPress={() => {
                      setVisitForm({ ...visitForm, location: '' });
                      setFilteredLocations(LOCATIONS);
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
              {showLocationDropdown && (
                <View style={[styles.dropdownContainer, { maxHeight: 150 }]}>
                  <ScrollView nestedScrollEnabled>
                    {filteredLocations.slice(0, 10).map((loc, index) => (
                      <TouchableOpacity
                        key={index}
                        style={styles.dropdownItem}
                        onPress={() => selectLocation(loc)}
                      >
                        <Text style={styles.dropdownItemText}>{loc}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              
              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={visitForm.notes}
                onChangeText={(text) => setVisitForm({ ...visitForm, notes: text })}
                placeholder="Add notes..."
                multiline
                numberOfLines={3}
              />
              
              <TouchableOpacity style={styles.submitButton} onPress={handleAddVisit}>
                <Text style={styles.submitButtonText}>Schedule Visit</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Add Deal Modal */}
      <Modal visible={showAddDealModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Deal</Text>
              <TouchableOpacity onPress={() => {
                setShowAddDealModal(false);
                setDealLeadSearchQuery('');
                setDealLeadSearchResults([]);
                setShowDealLeadDropdown(false);
              }}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.inputLabel}>Lead *</Text>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.input}
                  value={dealLeadSearchQuery}
                  onChangeText={searchDealLeads}
                  placeholder="Search lead by name or phone..."
                  onFocus={() => dealLeadSearchResults.length > 0 && setShowDealLeadDropdown(true)}
                />
                {selectedDealLead && (
                  <TouchableOpacity 
                    style={styles.clearButton}
                    onPress={() => {
                      setSelectedDealLead(null);
                      setDealLeadSearchQuery('');
                      setDealForm({ ...dealForm, lead_id: '', lead_name: '' });
                    }}
                  >
                    <Ionicons name="close-circle" size={20} color="#9CA3AF" />
                  </TouchableOpacity>
                )}
              </View>
              {showDealLeadDropdown && dealLeadSearchResults.length > 0 && (
                <View style={styles.dropdownContainer}>
                  {dealLeadSearchResults.slice(0, 5).map((lead) => (
                    <TouchableOpacity
                      key={lead.id}
                      style={styles.dropdownItem}
                      onPress={() => selectDealLead(lead)}
                    >
                      <View>
                        <Text style={styles.dropdownItemText}>{lead.name}</Text>
                        <Text style={styles.dropdownItemSubtext}>{lead.phone} • {lead.lead_type}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {selectedDealLead && (
                <View style={styles.selectedLeadCard}>
                  <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                  <Text style={styles.selectedLeadText}>
                    {selectedDealLead.name} ({selectedDealLead.phone})
                  </Text>
                </View>
              )}
              
              <Text style={styles.inputLabel}>Deal Amount (Cr) *</Text>
              <TextInput
                style={styles.input}
                value={dealForm.deal_amount}
                onChangeText={(text) => setDealForm({ ...dealForm, deal_amount: text })}
                placeholder="e.g., 2.5"
                keyboardType="decimal-pad"
              />
              
              <Text style={styles.inputLabel}>Commission %</Text>
              <TextInput
                style={styles.input}
                value={dealForm.commission_percent}
                onChangeText={(text) => setDealForm({ ...dealForm, commission_percent: text })}
                placeholder="e.g., 2"
                keyboardType="decimal-pad"
              />
              
              <Text style={styles.inputLabel}>Expected Closing Date</Text>
              <TextInput
                style={styles.input}
                value={dealForm.expected_closing_date}
                onChangeText={(text) => setDealForm({ ...dealForm, expected_closing_date: text })}
                placeholder="YYYY-MM-DD"
              />
              
              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={dealForm.notes}
                onChangeText={(text) => setDealForm({ ...dealForm, notes: text })}
                placeholder="Add notes..."
                multiline
                numberOfLines={3}
              />
              
              <TouchableOpacity style={styles.submitButton} onPress={handleAddDeal}>
                <Text style={styles.submitButtonText}>Create Deal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // When coming from popup, show simplified header with back button
  if (fromPopup) {
    return (
      <View style={styles.container}>
        {/* Simple Header with Back */}
        <View style={styles.simpleHeader}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <Text style={styles.simpleHeaderTitle}>
            {activeTab === 'visits' && 'Site Visits'}
            {activeTab === 'deals' && 'Deals & Transactions'}
            {activeTab === 'activity' && 'Activity Timeline'}
            {activeTab === 'team' && 'Team Members'}
            {activeTab === 'export' && 'Export Data'}
          </Text>
          {(activeTab === 'visits' || activeTab === 'deals') && (
            <TouchableOpacity 
              style={styles.headerAddButton} 
              onPress={() => activeTab === 'visits' ? setShowAddVisitModal(true) : setShowAddDealModal(true)}
            >
              <Ionicons name="add" size={24} color="#3B82F6" />
            </TouchableOpacity>
          )}
        </View>

        {/* Content */}
        <View style={styles.content}>
          {activeTab === 'visits' && (
            <FlatList
              data={siteVisits}
              renderItem={renderSiteVisit}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="location-outline" size={40} color="#9CA3AF" />
                  </View>
                  <Text style={styles.emptyTitle}>No Site Visits</Text>
                  <Text style={styles.emptyText}>Schedule your first property visit</Text>
                  <TouchableOpacity style={styles.emptyButton} onPress={() => setShowAddVisitModal(true)}>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <Text style={styles.emptyButtonText}>Schedule Visit</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}

          {activeTab === 'deals' && (
            <FlatList
              data={deals}
              renderItem={renderDeal}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="cash-outline" size={40} color="#9CA3AF" />
                  </View>
                  <Text style={styles.emptyTitle}>No Deals Yet</Text>
                  <Text style={styles.emptyText}>Create your first deal to track</Text>
                  <TouchableOpacity style={styles.emptyButton} onPress={() => setShowAddDealModal(true)}>
                    <Ionicons name="add" size={18} color="#FFFFFF" />
                    <Text style={styles.emptyButtonText}>Add Deal</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          )}

          {activeTab === 'team' && user?.role === 'admin' && (
            <FlatList
              data={teamMembers}
              renderItem={renderTeamMember}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="people-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No team members</Text>
                </View>
              }
            />
          )}

          {activeTab === 'activity' && (
            <FlatList
              data={activityLogs}
              renderItem={renderActivityLog}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconContainer}>
                    <Ionicons name="time-outline" size={40} color="#9CA3AF" />
                  </View>
                  <Text style={styles.emptyTitle}>No Activity Yet</Text>
                  <Text style={styles.emptyText}>Lead updates, calls, and notes will appear here</Text>
                </View>
              }
            />
          )}

          {activeTab === 'export' && canExport && (
            <ScrollView style={styles.exportContainer} contentContainerStyle={styles.exportContent}>
              {exporting && (
                <View style={styles.exportingOverlay}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.exportingText}>Exporting...</Text>
                </View>
              )}
              
              <View style={styles.exportSection}>
                <Text style={styles.exportSectionTitle}>Export Leads</Text>
                <Text style={styles.exportDescription}>Download lead data as CSV file</Text>
                
                <TouchableOpacity 
                  style={styles.exportButton} 
                  onPress={() => exportLeads('clients')}
                  disabled={exporting}
                >
                  <Ionicons name="people" size={20} color="#FFFFFF" />
                  <Text style={styles.exportButtonText}>Export Clients (Buyers/Tenants)</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.exportButton, { backgroundColor: '#8B5CF6' }]} 
                  onPress={() => exportLeads('inventory')}
                  disabled={exporting}
                >
                  <Ionicons name="business" size={20} color="#FFFFFF" />
                  <Text style={styles.exportButtonText}>Export Inventory (Sellers/Owners)</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.exportButton, { backgroundColor: '#059669' }]} 
                  onPress={() => exportLeads('all')}
                  disabled={exporting}
                >
                  <Ionicons name="document-text" size={20} color="#FFFFFF" />
                  <Text style={styles.exportButtonText}>Export All Leads</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.exportSection}>
                <Text style={styles.exportSectionTitle}>Export Deals</Text>
                <Text style={styles.exportDescription}>Download deals and transactions data</Text>
                
                <TouchableOpacity 
                  style={[styles.exportButton, { backgroundColor: '#F59E0B' }]} 
                  onPress={exportDeals}
                  disabled={exporting}
                >
                  <Ionicons name="cash" size={20} color="#FFFFFF" />
                  <Text style={styles.exportButtonText}>Export All Deals</Text>
                </TouchableOpacity>
              </View>
              
              <View style={styles.exportInfo}>
                <Ionicons name="information-circle" size={20} color="#6B7280" />
                <Text style={styles.exportInfoText}>
                  Exports are generated in CSV format which can be opened in Excel, Google Sheets, or any spreadsheet application.
                </Text>
              </View>
            </ScrollView>
          )}
        </View>

        {/* Modals */}
        {renderModals()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Gradient Header */}
      <View style={styles.header}>
        <View style={styles.headerGradient}>
          <Text style={styles.headerTitle}>More Features</Text>
          <Text style={styles.headerSubtitle}>Manage visits, deals & more</Text>
        </View>
      </View>

      {/* Feature Cards Grid */}
      <View style={styles.featureGrid}>
        <TouchableOpacity 
          style={[styles.featureCard, activeTab === 'visits' && styles.featureCardActive]}
          onPress={() => setActiveTab('visits')}
          activeOpacity={0.8}
        >
          <View style={[styles.featureIconContainer, { backgroundColor: '#EFF6FF' }]}>
            <Ionicons name="location" size={22} color="#3B82F6" />
          </View>
          <Text style={styles.featureCardTitle}>Site Visits</Text>
          <Text style={styles.featureCardCount}>{siteVisits.length}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.featureCard, activeTab === 'deals' && styles.featureCardActive]}
          onPress={() => setActiveTab('deals')}
          activeOpacity={0.8}
        >
          <View style={[styles.featureIconContainer, { backgroundColor: '#F0FDF4' }]}>
            <Ionicons name="cash" size={22} color="#10B981" />
          </View>
          <Text style={styles.featureCardTitle}>Deals</Text>
          <Text style={styles.featureCardCount}>{deals.length}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.featureCard, activeTab === 'activity' && styles.featureCardActive]}
          onPress={() => setActiveTab('activity')}
          activeOpacity={0.8}
        >
          <View style={[styles.featureIconContainer, { backgroundColor: '#FEF3C7' }]}>
            <Ionicons name="time" size={22} color="#F59E0B" />
          </View>
          <Text style={styles.featureCardTitle}>Activity</Text>
          <Text style={styles.featureCardCount}>{activityLogs.length}</Text>
        </TouchableOpacity>

        {user?.role === 'admin' && (
          <TouchableOpacity 
            style={[styles.featureCard, activeTab === 'team' && styles.featureCardActive]}
            onPress={() => setActiveTab('team')}
            activeOpacity={0.8}
          >
            <View style={[styles.featureIconContainer, { backgroundColor: '#F3E8FF' }]}>
              <Ionicons name="people" size={22} color="#8B5CF6" />
            </View>
            <Text style={styles.featureCardTitle}>Team</Text>
            <Text style={styles.featureCardCount}>{teamMembers.length}</Text>
          </TouchableOpacity>
        )}

        {canExport && (
          <TouchableOpacity 
            style={[styles.featureCard, activeTab === 'export' && styles.featureCardActive]}
            onPress={() => setActiveTab('export')}
            activeOpacity={0.8}
          >
            <View style={[styles.featureIconContainer, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="download" size={22} color="#EF4444" />
            </View>
            <Text style={styles.featureCardTitle}>Export</Text>
            <Text style={styles.featureCardCount}>CSV</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Section Title */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {activeTab === 'visits' && 'Site Visits'}
          {activeTab === 'deals' && 'Deals & Transactions'}
          {activeTab === 'activity' && 'Activity Timeline'}
          {activeTab === 'team' && 'Team Members'}
          {activeTab === 'export' && 'Export Data'}
        </Text>
        {(activeTab === 'visits' || activeTab === 'deals') && (
          <TouchableOpacity 
            style={styles.addButtonSmall} 
            onPress={() => activeTab === 'visits' ? setShowAddVisitModal(true) : setShowAddDealModal(true)}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'visits' && (
          <FlatList
            data={siteVisits}
            renderItem={renderSiteVisit}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="location-outline" size={40} color="#9CA3AF" />
                </View>
                <Text style={styles.emptyTitle}>No Site Visits</Text>
                <Text style={styles.emptyText}>Schedule your first property visit</Text>
                <TouchableOpacity style={styles.emptyButton} onPress={() => setShowAddVisitModal(true)}>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.emptyButtonText}>Schedule Visit</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

        {activeTab === 'deals' && (
          <FlatList
            data={deals}
            renderItem={renderDeal}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="cash-outline" size={40} color="#9CA3AF" />
                </View>
                <Text style={styles.emptyTitle}>No Deals Yet</Text>
                <Text style={styles.emptyText}>Create your first deal to track</Text>
                <TouchableOpacity style={styles.emptyButton} onPress={() => setShowAddDealModal(true)}>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.emptyButtonText}>Add Deal</Text>
                </TouchableOpacity>
              </View>
            }
          />
        )}

        {activeTab === 'team' && user?.role === 'admin' && (
          <FlatList
            data={teamMembers}
            renderItem={renderTeamMember}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={48} color="#9CA3AF" />
                <Text style={styles.emptyText}>No team members</Text>
              </View>
            }
          />
        )}

        {activeTab === 'activity' && (
          <FlatList
            data={activityLogs}
            renderItem={renderActivityLog}
            keyExtractor={(item) => item.id.toString()}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="time-outline" size={48} color="#9CA3AF" />
                <Text style={styles.emptyText}>No activity yet</Text>
                <Text style={styles.emptySubtext}>Lead updates, calls, and notes will appear here</Text>
              </View>
            }
          />
        )}

        {activeTab === 'export' && (
          <ScrollView style={styles.exportContainer} contentContainerStyle={styles.exportContent}>
            {exporting && (
              <View style={styles.exportingOverlay}>
                <ActivityIndicator size="large" color="#FFFFFF" />
                <Text style={styles.exportingText}>Exporting...</Text>
              </View>
            )}
            
            <View style={styles.exportSection}>
              <Text style={styles.exportSectionTitle}>Export Leads</Text>
              <Text style={styles.exportDescription}>Download lead data as CSV file</Text>
              
              <TouchableOpacity 
                style={styles.exportButton} 
                onPress={() => exportLeads('clients')}
                disabled={exporting}
              >
                <Ionicons name="people" size={20} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>Export Clients (Buyers/Tenants)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.exportButton, { backgroundColor: '#8B5CF6' }]} 
                onPress={() => exportLeads('inventory')}
                disabled={exporting}
              >
                <Ionicons name="business" size={20} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>Export Inventory (Sellers/Owners)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.exportButton, { backgroundColor: '#059669' }]} 
                onPress={() => exportLeads('all')}
                disabled={exporting}
              >
                <Ionicons name="document-text" size={20} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>Export All Leads</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.exportSection}>
              <Text style={styles.exportSectionTitle}>Export Deals</Text>
              <Text style={styles.exportDescription}>Download deals and transactions data</Text>
              
              <TouchableOpacity 
                style={[styles.exportButton, { backgroundColor: '#F59E0B' }]} 
                onPress={exportDeals}
                disabled={exporting}
              >
                <Ionicons name="cash" size={20} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>Export All Deals</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.exportInfo}>
              <Ionicons name="information-circle" size={20} color="#6B7280" />
              <Text style={styles.exportInfoText}>
                Exports are generated in CSV format which can be opened in Excel, Google Sheets, or any spreadsheet application.
              </Text>
            </View>
          </ScrollView>
        )}
      </View>

      {renderModals()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#3B82F6',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerGradient: {
    // Simulated gradient effect with solid color
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    marginTop: -10,
  },
  featureCard: {
    width: '31%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  featureCardActive: {
    borderColor: '#3B82F6',
    borderWidth: 2,
    backgroundColor: '#EFF6FF',
  },
  featureIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  featureCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  featureCardCount: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  addButtonSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  listContainer: {
    padding: 16,
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  cardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardBody: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
  },
  notesText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
  actionBtn: {
    backgroundColor: '#F3F4F6',
    padding: 10,
    borderRadius: 8,
  },
  dealStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
  },
  dealStat: {
    alignItems: 'center',
  },
  dealStatLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  dealStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 2,
  },
  avatarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  teamStats: {
    flexDirection: 'row',
    gap: 24,
  },
  teamStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamStat: {
    alignItems: 'center',
  },
  teamStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3B82F6',
  },
  teamStatLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  permissionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  permissionToggleActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  permissionToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  permissionToggleTextActive: {
    color: '#059669',
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6366F1',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 30,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Tabs container for horizontal scroll
  tabsContainer: {
    backgroundColor: '#FFFFFF',
    maxHeight: 70,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    borderRadius: 10,
    gap: 6,
    backgroundColor: '#F3F4F6',
  },
  activeTab: {
    backgroundColor: '#3B82F6',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  // Activity Log styles
  activityCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: 'flex-start',
    gap: 12,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  activityMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  activityLead: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  activityTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  activityUser: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  emptySubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },
  // Export styles
  exportContainer: {
    flex: 1,
  },
  exportContent: {
    padding: 16,
    paddingBottom: 32,
  },
  exportingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  exportingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 12,
  },
  exportSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  exportSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  exportDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  exportInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  exportInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
  // Search and Dropdown styles
  searchContainer: {
    position: 'relative',
  },
  clearButton: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  dropdownContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: -8,
    marginBottom: 12,
    maxHeight: 200,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownItemText: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '500',
  },
  dropdownItemSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  selectedLeadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    gap: 8,
  },
  selectedLeadText: {
    fontSize: 14,
    color: '#065F46',
    fontWeight: '500',
  },
  // Simple header styles for popup navigation
  simpleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  simpleHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    flex: 1,
    textAlign: 'center',
  },
  headerAddButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Date/Time picker styles
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  datePickerText: {
    fontSize: 15,
    color: '#1F2937',
    flex: 1,
  },
  placeholderText: {
    color: '#9CA3AF',
  },
  dropdownItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  dropdownItemTextSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },
});
