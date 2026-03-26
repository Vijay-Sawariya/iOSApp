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
  floor: string | null;
  budget_min: number | null;
  budget_max: number | null;
  unit: string | null;
  created_at?: string | null;
}

export default function ClientLeadsScreen() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [temperatureFilter, setTemperatureFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'date' | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const loadLeads = async () => {
    try {
      const data = await api.getClientLeads();
      setLeads(data);
      applyFilters(data, searchQuery, temperatureFilter, sortBy);
    } catch (error) {
      console.error('Failed to load client leads:', error);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const applyFilters = (data: Lead[], search: string, temp: string | null, sort: 'name' | 'date' | null) => {
    let filtered = [...data];
    
    // Apply search
    if (search) {
      filtered = filtered.filter(
        (lead) =>
          lead.name.toLowerCase().includes(search.toLowerCase()) ||
          lead.phone?.includes(search) ||
          lead.email?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    // Apply temperature filter
    if (temp) {
      filtered = filtered.filter((lead) => lead.lead_temperature === temp);
    }
    
    // Apply sort
    if (sort === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
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
    applyFilters(leads, text, temperatureFilter, sortBy);
  };

  const handleTemperatureFilter = (temp: string | null) => {
    setTemperatureFilter(temp);
    applyFilters(leads, searchQuery, temp, sortBy);
  };

  const handleSort = (sort: 'name' | 'date' | null) => {
    setSortBy(sort);
    applyFilters(leads, searchQuery, temperatureFilter, sort);
  };

  const clearFilters = () => {
    setTemperatureFilter(null);
    setSortBy(null);
    applyFilters(leads, searchQuery, null, null);
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

  const formatUnit = (unit: string | null): string => {
    if (!unit) return '';
    switch (unit.toUpperCase()) {
      case 'CR':
        return 'Cr';
      case 'L':
        return 'L';
      case 'K':
      case 'TH':
        return 'K';
      default:
        return unit;
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

  const renderLead = ({ item }: { item: Lead }) => {
    const budgetText = formatBudget(item);
    
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

        {/* Client Preferences Section */}
        {(item.floor || budgetText) ? (
          <View style={styles.preferencesContainer}>
            {item.floor ? (
              <View style={styles.preferenceItem}>
                <Ionicons name="layers" size={14} color="#3B82F6" />
                <Text style={styles.preferenceText}>{'Floors: '}{item.floor}</Text>
              </View>
            ) : null}
            {budgetText ? (
              <View style={styles.preferenceItem}>
                <Ionicons name="wallet" size={14} color="#10B981" />
                <Text style={styles.preferenceText}>{'Budget: '}{budgetText}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

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
  };

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
        <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.filterButton}>
          <Ionicons name="filter" size={20} color={temperatureFilter || sortBy ? '#3B82F6' : '#6B7280'} />
        </TouchableOpacity>
      </View>

      {/* Filter Options */}
      {showFilters ? (
        <View style={styles.filterContainer}>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>{'Temperature:'}</Text>
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
            <Text style={styles.filterLabel}>{'Sort by:'}</Text>
            <View style={styles.filterOptions}>
              <TouchableOpacity
                style={[styles.filterChip, sortBy === 'name' && styles.filterChipActive]}
                onPress={() => handleSort(sortBy === 'name' ? null : 'name')}
              >
                <Ionicons name="text" size={14} color={sortBy === 'name' ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.filterChipText, sortBy === 'name' && styles.filterChipTextActive]}>{' Name'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, sortBy === 'date' && styles.filterChipActive]}
                onPress={() => handleSort(sortBy === 'date' ? null : 'date')}
              >
                <Ionicons name="calendar" size={14} color={sortBy === 'date' ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.filterChipText, sortBy === 'date' && styles.filterChipTextActive]}>{' Date'}</Text>
              </TouchableOpacity>
            </View>
          </View>
          {(temperatureFilter || sortBy) ? (
            <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
              <Text style={styles.clearFiltersText}>{'Clear Filters'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

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
});
