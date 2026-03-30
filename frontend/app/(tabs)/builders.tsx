import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineApi } from '../../services/offlineApi';
import { useOffline } from '../../contexts/OfflineContext';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

interface Builder {
  id: string;
  builder_name: string;
  company_name: string;
  phone: string;
  address: string | null;
  created_by_name?: string | null;
}

export default function BuildersScreen() {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [filteredBuilders, setFilteredBuilders] = useState<Builder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'company' | null>(null);
  const { isOnline } = useOffline();

  const loadBuilders = async () => {
    try {
      const data = await offlineApi.getBuilders();
      setBuilders(data);
      applyFilters(data, searchQuery, sortBy);
    } catch (error) {
      console.error('Failed to load builders:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadBuilders();
    }, [])
  );

  const applyFilters = (data: Builder[], search: string, sort: 'name' | 'company' | null) => {
    let filtered = [...data];
    
    if (search) {
      filtered = filtered.filter(
        (builder) =>
          builder.builder_name.toLowerCase().includes(search.toLowerCase()) ||
          builder.company_name?.toLowerCase().includes(search.toLowerCase()) ||
          builder.phone?.includes(search) ||
          builder.address?.toLowerCase().includes(search.toLowerCase())
      );
    }
    
    if (sort === 'name') {
      filtered.sort((a, b) => a.builder_name.localeCompare(b.builder_name));
    } else if (sort === 'company') {
      filtered.sort((a, b) => (a.company_name || '').localeCompare(b.company_name || ''));
    }
    
    setFilteredBuilders(filtered);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBuilders();
    setRefreshing(false);
  };

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    applyFilters(builders, text, sortBy);
  };

  const handleSort = (sort: 'name' | 'company' | null) => {
    setSortBy(sort);
    applyFilters(builders, searchQuery, sort);
  };

  const clearFilters = () => {
    setSortBy(null);
    setSearchQuery('');
    applyFilters(builders, '', null);
  };

  const handleDelete = (id: string, name: string) => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot delete builder while offline.');
      return;
    }
    Alert.alert('Delete Builder', `Are you sure you want to delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await offlineApi.deleteBuilder(id);
            loadBuilders();
            Alert.alert('Success', 'Builder deleted successfully');
          } catch (error) {
            Alert.alert('Error', 'Failed to delete builder');
          }
        },
      },
    ]);
  };

  const renderBuilder = ({ item }: { item: Builder }) => (
    <View style={styles.builderCard}>
      <TouchableOpacity
        style={styles.builderContent}
        onPress={() => router.push(`/builders/${item.id}`)}
      >
        <View style={styles.builderIcon}>
          <Ionicons name="business" size={24} color="#3B82F6" />
        </View>
        <View style={styles.builderInfo}>
          <Text style={styles.builderName}>{item.builder_name}</Text>
          <Text style={styles.companyName}>{item.company_name}</Text>
          {item.created_by_name && (
            <Text style={styles.createdByText}>by {item.created_by_name}</Text>
          )}
          <View style={styles.contactInfo}>
            <Ionicons name="call" size={12} color="#6B7280" />
            <Text style={styles.phone}>{item.phone}</Text>
          </View>
          {item.address && (
            <View style={styles.contactInfo}>
              <Ionicons name="location" size={12} color="#6B7280" />
              <Text style={styles.address} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      
      {/* Action Buttons */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.push(`/builders/edit/${item.id}` as any)}
        >
          <Ionicons name="create-outline" size={18} color="#3B82F6" />
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleDelete(item.id, item.builder_name)}
        >
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
          <Text style={[styles.actionText, { color: '#EF4444' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Blue Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.blueHeader}>
          <Text style={styles.headerTitle}>Builders</Text>
        </View>
      </SafeAreaView>

      {/* Stats Bar */}
      <View style={styles.statsBarContainer}>
        <View style={styles.statsBar}>
          <View style={styles.statItemTotal}>
            <Text style={styles.statNumberTotal}>{filteredBuilders.length}</Text>
            <Text style={styles.statLabelTotal}>Total</Text>
          </View>
          <View style={styles.statItemInfo}>
            <Text style={styles.statSubtitle}>Companies & Contractors</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#6B7280" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search builders..."
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

      {showFilters && (
        <View style={styles.filterContainer}>
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>Sort by:</Text>
            <View style={styles.filterOptions}>
              <TouchableOpacity
                style={[styles.filterChip, sortBy === 'name' && styles.filterChipActive]}
                onPress={() => handleSort(sortBy === 'name' ? null : 'name')}
              >
                <Ionicons name="person" size={14} color={sortBy === 'name' ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.filterChipText, sortBy === 'name' && styles.filterChipTextActive]}> Name</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, sortBy === 'company' && styles.filterChipActive]}
                onPress={() => handleSort(sortBy === 'company' ? null : 'company')}
              >
                <Ionicons name="business" size={14} color={sortBy === 'company' ? '#FFFFFF' : '#6B7280'} />
                <Text style={[styles.filterChipText, sortBy === 'company' && styles.filterChipTextActive]}> Company</Text>
              </TouchableOpacity>
            </View>
          </View>
          {(sortBy || searchQuery) && (
            <TouchableOpacity style={styles.clearFiltersButton} onPress={clearFilters}>
              <Text style={styles.clearFiltersText}>Clear Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        data={filteredBuilders}
        renderItem={renderBuilder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="business-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No builders found</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first builder</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/builders/add')}>
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
  statsBarContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItemTotal: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginRight: 12,
  },
  statNumberTotal: {
    fontSize: 22,
    fontWeight: '700',
    color: '#3B82F6',
  },
  statLabelTotal: {
    fontSize: 12,
    color: '#3B82F6',
    marginTop: 2,
  },
  statItemInfo: {
    flex: 1,
  },
  statSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  header: {
    backgroundColor: '#3B82F6',
    padding: 20,
    paddingTop: 16,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#DBEAFE',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    marginHorizontal: 16,
    marginVertical: 8,
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
    marginBottom: 8,
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
  listContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 100,
    backgroundColor: '#F9FAFB',
  },
  builderCard: {
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
  builderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  builderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  builderInfo: {
    flex: 1,
  },
  builderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  companyName: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  createdByText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  phone: {
    fontSize: 12,
    color: '#6B7280',
  },
  address: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
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
});
