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
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';

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
}

export default function MoreScreen() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'visits' | 'deals' | 'team'>('visits');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Data states
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  
  // Modal states
  const [showAddVisitModal, setShowAddVisitModal] = useState(false);
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  
  // Form states
  const [visitForm, setVisitForm] = useState({
    lead_id: '',
    visit_date: '',
    visit_time: '',
    location: '',
    notes: '',
  });
  
  const [dealForm, setDealForm] = useState({
    lead_id: '',
    deal_amount: '',
    commission_percent: '',
    expected_closing_date: '',
    notes: '',
  });

  const fetchData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      
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
        const teamRes = await fetch(`${API_URL}/api/team/members`, { headers });
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          setTeamMembers(teamData);
        }
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

  const renderTeamMember = ({ item }: { item: TeamMember }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
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
        <View style={styles.teamStats}>
          <View style={styles.teamStat}>
            <Text style={styles.teamStatValue}>{item.lead_count || 0}</Text>
            <Text style={styles.teamStatLabel}>Leads</Text>
          </View>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More Features</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'visits' && styles.activeTab]} 
          onPress={() => setActiveTab('visits')}
        >
          <Ionicons name="location" size={18} color={activeTab === 'visits' ? '#3B82F6' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'visits' && styles.activeTabText]}>Site Visits</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'deals' && styles.activeTab]} 
          onPress={() => setActiveTab('deals')}
        >
          <Ionicons name="cash" size={18} color={activeTab === 'deals' ? '#3B82F6' : '#6B7280'} />
          <Text style={[styles.tabText, activeTab === 'deals' && styles.activeTabText]}>Deals</Text>
        </TouchableOpacity>
        {user?.role === 'admin' && (
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'team' && styles.activeTab]} 
            onPress={() => setActiveTab('team')}
          >
            <Ionicons name="people" size={18} color={activeTab === 'team' ? '#3B82F6' : '#6B7280'} />
            <Text style={[styles.tabText, activeTab === 'team' && styles.activeTabText]}>Team</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeTab === 'visits' && (
          <>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddVisitModal(true)}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Schedule Visit</Text>
            </TouchableOpacity>
            <FlatList
              data={siteVisits}
              renderItem={renderSiteVisit}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="location-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No site visits scheduled</Text>
                </View>
              }
            />
          </>
        )}

        {activeTab === 'deals' && (
          <>
            <TouchableOpacity style={styles.addButton} onPress={() => setShowAddDealModal(true)}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add Deal</Text>
            </TouchableOpacity>
            <FlatList
              data={deals}
              renderItem={renderDeal}
              keyExtractor={(item) => item.id.toString()}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Ionicons name="cash-outline" size={48} color="#9CA3AF" />
                  <Text style={styles.emptyText}>No deals yet</Text>
                </View>
              }
            />
          </>
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
      </View>

      {/* Add Site Visit Modal */}
      <Modal visible={showAddVisitModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Schedule Site Visit</Text>
              <TouchableOpacity onPress={() => setShowAddVisitModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Lead ID *</Text>
              <TextInput
                style={styles.input}
                value={visitForm.lead_id}
                onChangeText={(text) => setVisitForm({ ...visitForm, lead_id: text })}
                placeholder="Enter Lead ID"
                keyboardType="numeric"
              />
              
              <Text style={styles.inputLabel}>Visit Date *</Text>
              <TextInput
                style={styles.input}
                value={visitForm.visit_date}
                onChangeText={(text) => setVisitForm({ ...visitForm, visit_date: text })}
                placeholder="YYYY-MM-DD"
              />
              
              <Text style={styles.inputLabel}>Visit Time</Text>
              <TextInput
                style={styles.input}
                value={visitForm.visit_time}
                onChangeText={(text) => setVisitForm({ ...visitForm, visit_time: text })}
                placeholder="HH:MM"
              />
              
              <Text style={styles.inputLabel}>Location</Text>
              <TextInput
                style={styles.input}
                value={visitForm.location}
                onChangeText={(text) => setVisitForm({ ...visitForm, location: text })}
                placeholder="Visit location"
              />
              
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
              <TouchableOpacity onPress={() => setShowAddDealModal(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Lead ID *</Text>
              <TextInput
                style={styles.input}
                value={dealForm.lead_id}
                onChangeText={(text) => setDealForm({ ...dealForm, lead_id: text })}
                placeholder="Enter Lead ID"
                keyboardType="numeric"
              />
              
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#EFF6FF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#3B82F6',
  },
  content: {
    flex: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    marginTop: 12,
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
});
