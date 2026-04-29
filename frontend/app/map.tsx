import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  TextInput,
  ScrollView,
  Linking,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { LOCATIONS } from '../constants/leadOptions';

interface MapLead {
  id: number;
  name: string;
  lead_type: string;
  location: string;
  address: string | null;
  Property_locationUrl: string | null;
  budget_min: number | null;
  budget_max: number | null;
  bhk: string | null;
  area_size: string | null;
}

export default function MapViewScreen() {
  const { token } = useAuth();
  const [leads, setLeads] = useState<MapLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [locationSearch, setLocationSearch] = useState('');

  const loadMapData = useCallback(async () => {
    if (!token) return;
    
    setError(null);
    try {
      const data = await api.getMapData(typeFilter || undefined);
      setLeads(data || []);
    } catch (err: any) {
      console.error('Failed to load map data:', err);
      setError(err.message || 'Failed to load properties');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, typeFilter]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadMapData();
  };

  // Filter leads - only show those with Property_locationUrl
  const filteredLeads = leads.filter(l => {
    const hasMapUrl = l.Property_locationUrl && l.Property_locationUrl.trim() !== '';
    const matchesLocation = !locationFilter || 
      l.location?.toLowerCase().includes(locationFilter.toLowerCase());
    return hasMapUrl && matchesLocation;
  });

  // Leads without map URL (for stats)
  const leadsWithoutMapUrl = leads.filter(l => !l.Property_locationUrl || l.Property_locationUrl.trim() === '');

  const openInMaps = (url: string) => {
    Linking.openURL(url).catch(err => console.error('Failed to open map:', err));
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'seller': return { bg: '#DCFCE7', text: '#16A34A', label: 'For Sale' };
      case 'landlord': return { bg: '#FEF3C7', text: '#D97706', label: 'For Rent' };
      case 'builder': return { bg: '#F3E8FF', text: '#7C3AED', label: 'Builder' };
      default: return { bg: '#F3F4F6', text: '#6B7280', label: type };
    }
  };

  // Filtered location options
  const filteredLocations = LOCATIONS.filter(loc => 
    loc.toLowerCase().includes(locationSearch.toLowerCase())
  );

  const renderPropertyCard = ({ item }: { item: MapLead }) => {
    const typeInfo = getTypeColor(item.lead_type);
    const budget = item.budget_max || item.budget_min;
    
    return (
      <View style={styles.propertyCard}>
        <TouchableOpacity
          style={styles.cardContent}
          onPress={() => router.push(`/leads/${item.id}` as any)}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View style={styles.nameSection}>
              <Text style={styles.propertyName} numberOfLines={1}>{item.name}</Text>
              {item.location && (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={14} color="#6B7280" />
                  <Text style={styles.locationText} numberOfLines={1}> {item.address} {item.location}</Text>
                </View>
              )}
            </View>
            <View style={[styles.typeBadge, { backgroundColor: typeInfo.bg }]}>
              <Text style={[styles.typeBadgeText, { color: typeInfo.text }]}>{typeInfo.label}</Text>
            </View>
          </View>
          
          <View style={styles.detailsRow}>
            {item.area_size && (
              <View style={styles.detailChip}>
                <Ionicons name="resize-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{item.area_size} sq.yds</Text>
              </View>
            )}
            {item.bhk && (
              <View style={styles.detailChip}>
                <Ionicons name="bed-outline" size={14} color="#6B7280" />
                <Text style={styles.detailText}>{item.bhk}</Text>
              </View>
            )}
            {budget && (
              <View style={styles.detailChip}>
                <Text style={styles.budgetText}>₹{budget} Cr</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        
        {/* Map Button */}
        <TouchableOpacity
          style={styles.mapButton}
          onPress={() => openInMaps(item.Property_locationUrl!)}
        >
          <Ionicons name="navigate" size={20} color="#FFFFFF" />
          <Text style={styles.mapButtonText}>Open in Maps</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Map View</Text>
          <TouchableOpacity 
            style={styles.filterBtn}
            onPress={() => setShowFilters(!showFilters)}
          >
            <Ionicons 
              name="options-outline" 
              size={22} 
              color={(typeFilter || locationFilter) ? '#FFD700' : '#FFFFFF'} 
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Ionicons name="location" size={18} color="#10B981" />
          <Text style={styles.statsText}>
            {filteredLeads.length} properties with map location
          </Text>
        </View>
        {leadsWithoutMapUrl.length > 0 && (
          <Text style={styles.statsSubtext}>
            {leadsWithoutMapUrl.length} without location
          </Text>
        )}
      </View>

      {/* Filters Panel */}
      {showFilters && (
        <View style={styles.filtersPanel}>
          <Text style={styles.filterLabel}>Property Type:</Text>
          <View style={styles.typeFilters}>
            {[
              { label: 'All', value: '' },
              { label: 'Sale', value: 'seller' },
              { label: 'Rent', value: 'landlord' },
              { label: 'Builder', value: 'builder' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.typeChip,
                  typeFilter === opt.value && styles.typeChipActive
                ]}
                onPress={() => setTypeFilter(opt.value)}
              >
                <Text style={[
                  styles.typeChipText,
                  typeFilter === opt.value && styles.typeChipTextActive
                ]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.filterLabel}>Location:</Text>
          <View style={styles.locationSearchContainer}>
            <Ionicons name="search" size={18} color="#6B7280" />
            <TextInput
              style={styles.locationSearchInput}
              placeholder="Search locations..."
              placeholderTextColor="#9CA3AF"
              value={locationSearch}
              onChangeText={setLocationSearch}
            />
            {locationSearch && (
              <TouchableOpacity onPress={() => setLocationSearch('')}>
                <Ionicons name="close-circle" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
          
          {locationSearch && filteredLocations.length > 0 && (
            <View style={styles.locationDropdown}>
              <ScrollView style={styles.locationDropdownScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {filteredLocations.slice(0, 6).map(loc => (
                  <TouchableOpacity
                    key={loc}
                    style={[
                      styles.locationItem,
                      locationFilter === loc && styles.locationItemActive
                    ]}
                    onPress={() => {
                      setLocationFilter(loc);
                      setLocationSearch('');
                    }}
                  >
                    <Text style={styles.locationItemText}>{loc}</Text>
                    {locationFilter === loc && (
                      <Ionicons name="checkmark" size={18} color="#3B82F6" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {locationFilter && (
            <View style={styles.selectedLocationTag}>
              <Ionicons name="location" size={14} color="#3B82F6" />
              <Text style={styles.selectedLocationText}>{locationFilter}</Text>
              <TouchableOpacity onPress={() => setLocationFilter('')}>
                <Ionicons name="close-circle" size={16} color="#3B82F6" />
              </TouchableOpacity>
            </View>
          )}

          {(typeFilter || locationFilter) && (
            <TouchableOpacity 
              style={styles.clearFiltersBtn}
              onPress={() => {
                setTypeFilter('');
                setLocationFilter('');
              }}
            >
              <Text style={styles.clearFiltersBtnText}>Clear All Filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Properties List */}
      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading properties...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={48} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={loadMapData}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filteredLeads.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="map-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No properties with map location</Text>
            <Text style={styles.emptySubtext}>
              {leads.length > 0 
                ? `${leads.length} properties found but missing Google Maps URL`
                : 'Try adjusting your filters'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredLeads}
            renderItem={renderPropertyCard}
            keyExtractor={(item) => item.id.toString()}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#3B82F6']} />
            }
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  headerSafeArea: {
    backgroundColor: '#3B82F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3B82F6',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginLeft: 12,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statsText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  statsSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  filtersPanel: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    marginTop: 8,
  },
  typeFilters: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  typeChipActive: {
    backgroundColor: '#3B82F6',
  },
  typeChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  typeChipTextActive: {
    color: '#FFFFFF',
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
  },
  locationDropdown: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginTop: 4,
    maxHeight: 180,
  },
  locationDropdownScroll: {
    maxHeight: 180,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  locationItemActive: {
    backgroundColor: '#EFF6FF',
  },
  locationItemText: {
    fontSize: 15,
    color: '#1F2937',
  },
  selectedLocationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  selectedLocationText: {
    fontSize: 13,
    color: '#3B82F6',
    fontWeight: '500',
  },
  clearFiltersBtn: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  clearFiltersBtnText: {
    color: '#EF4444',
    fontWeight: '600',
    fontSize: 14,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  propertyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  cardContent: {
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
  propertyName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 13,
    color: '#6B7280',
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  detailText: {
    fontSize: 13,
    color: '#374151',
  },
  budgetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  mapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    gap: 8,
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#3B82F6',
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
