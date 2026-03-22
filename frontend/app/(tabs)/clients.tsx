import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { router } from 'expo-router';

interface Lead {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  lead_type: string | null;
  lead_temperature: string | null;
  lead_status: string | null;
  location: string | null;
}

export default function ClientLeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadLeads = async () => {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/leads/clients`, {
        headers: {
          'Authorization': `Bearer ${await getToken()}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setLeads(data);
        setFilteredLeads(data);
      }
    } catch (error) {
      console.error('Failed to load client leads:', error);
    }
  };

  const getToken = async () => {
    const { getAuthToken } = await import('../../services/api');
    return getAuthToken();
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLeads();
    setRefreshing(false);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    if (text === '') {
      setFilteredLeads(leads);
    } else {
      const filtered = leads.filter(
        (lead) =>
          lead.name.toLowerCase().includes(text.toLowerCase()) ||
          lead.phone?.includes(text) ||
          lead.email?.toLowerCase().includes(text.toLowerCase())
      );
      setFilteredLeads(filtered);
    }
  };

  const getTemperatureColor = (temp: string | null) => {
    switch (temp) {
      case 'Hot':
        return '#EF4444';
      case 'Warm':
        return '#F59E0B';
      case 'Cold':
        return '#6366F1';
      default:
        return '#9CA3AF';
    }
  };

  const getTypeIcon = (type: string | null) => {
    return type === 'buyer' ? 'cart' : 'key';
  };

  const renderLead = ({ item }: { item: Lead }) => (
    <TouchableOpacity
      style={styles.leadCard}
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
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Client Leads</Text>
        <Text style={styles.headerSubtitle}>Buyers & Tenants</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search clients..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

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
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  leadInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  typeIcon: {
    marginRight: 8,
  },
  leadName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  leadMeta: {
    gap: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#6B7280',
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
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
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
});
