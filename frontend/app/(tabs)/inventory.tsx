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
  property_type: string | null;
}

export default function InventoryLeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadLeads = async () => {
    try {
      const data = await api.getInventoryLeads();
      setLeads(data);
      setFilteredLeads(data);
    } catch (error) {
      console.error('Failed to load inventory leads:', error);
    }
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
          lead.email?.toLowerCase().includes(text.toLowerCase()) ||
          lead.location?.toLowerCase().includes(text.toLowerCase())
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
    switch (type) {
      case 'seller':
        return 'home';
      case 'landlord':
        return 'key';
      case 'builder':
        return 'business';
      default:
        return 'cube';
    }
  };

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case 'seller':
        return { bg: '#FEF3C7', text: '#92400E' };
      case 'landlord':
        return { bg: '#DBEAFE', text: '#1E40AF' };
      case 'builder':
        return { bg: '#D1FAE5', text: '#065F46' };
      default:
        return { bg: '#F3F4F6', text: '#6B7280' };
    }
  };

  const getTypeLabel = (type: string | null) => {
    switch (type) {
      case 'seller':
        return 'Seller';
      case 'landlord':
        return 'Landlord';
      case 'builder':
        return 'Builder';
      default:
        return 'Unknown';
    }
  };

  const renderLead = ({ item }: { item: Lead }) => {
    const typeColor = getTypeColor(item.lead_type);
    
    return (
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
                color={typeColor.text} 
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
              {item.property_type && (
                <View style={styles.metaItem}>
                  <Ionicons name="home-outline" size={12} color="#6B7280" />
                  <Text style={styles.metaText}>{item.property_type}</Text>
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
          <View style={[styles.typeBadge, { backgroundColor: typeColor.bg }]}>
            <Text style={[styles.typeBadgeText, { color: typeColor.text }]}>
              {getTypeLabel(item.lead_type)}
            </Text>
          </View>
          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>{item.lead_status || 'New'}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Inventory Leads</Text>
        <Text style={styles.headerSubtitle}>Sellers, Landlords & Builders</Text>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search inventory..."
          value={searchQuery}
          onChangeText={handleSearch}
        />
      </View>

      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Ionicons name="home" size={16} color="#92400E" />
          <Text style={styles.statText}>
            {leads.filter((l) => l.lead_type === 'seller').length} Sellers
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="key" size={16} color="#1E40AF" />
          <Text style={styles.statText}>
            {leads.filter((l) => l.lead_type === 'landlord').length} Landlords
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="business" size={16} color="#065F46" />
          <Text style={styles.statText}>
            {leads.filter((l) => l.lead_type === 'builder').length} Builders
          </Text>
        </View>
      </View>

      <FlatList
        data={filteredLeads}
        renderItem={renderLead}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="home-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No inventory leads found</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first property</Text>
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
    backgroundColor: '#10B981',
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
    color: '#D1FAE5',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
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
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
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
    flex: 1,
  },
  leadMeta: {
    gap: 6,
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
    backgroundColor: '#10B981',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
