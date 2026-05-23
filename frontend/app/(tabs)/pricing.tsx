import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../services/api';

interface FloorPrice {
  id?: number;
  floor_label: string;
  tentative_floor_price: string;
}

interface PlotPricing {
  id: number;
  plot_size: number;
  price_per_sq_yard: string;
  min_price: number;
  max_price: number;
  tentative_price?: number;
  floors: FloorPrice[];
}

interface LocationPricing {
  location_id: number;
  location_name: string;
  colony_category: string;
  circle_rate: number | string;
  plots: PlotPricing[];
}

interface Location {
  id: number;
  name: string;
  colony_category: string;
  circle_rate: number;
}

const FLOOR_OPTIONS = [
  'BMT + GF',
  'FF',
  'SF',
  'TF+Terr',
  '4F',
  '4F+Terr',
  'Terrace',
];

export default function PricingScreen() {
  const [pricingData, setPricingData] = useState<LocationPricing[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set());
  const [expandedPlots, setExpandedPlots] = useState<Set<number>>(new Set());
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPlot, setEditingPlot] = useState<PlotPricing | null>(null);
  
  // Form states
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [plotSize, setPlotSize] = useState('');
  const [pricePerSqYard, setPricePerSqYard] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [floors, setFloors] = useState<FloorPrice[]>([{ floor_label: '', tentative_floor_price: '' }]);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [pricing, locs] = await Promise.all([
        api.getAllPricing(),
        api.getAllLocations(),
      ]);
      setPricingData(pricing);
      setLocations(locs);
      setExpandedLocations(prev => {
        if (prev.size > 0) return prev;
        return new Set(pricing.map((item: LocationPricing) => item.location_name));
      });
    } catch (error) {
      console.error('Failed to load pricing data:', error);
      Alert.alert(
        'Error',
        error instanceof Error && error.message ? error.message : 'Failed to load pricing data'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const toggleLocation = (locationName: string) => {
    setExpandedLocations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(locationName)) {
        newSet.delete(locationName);
      } else {
        newSet.add(locationName);
      }
      return newSet;
    });
  };

  const togglePlotFloors = (plotId: number) => {
    setExpandedPlots(prev => {
      const newSet = new Set(prev);
      if (newSet.has(plotId)) {
        newSet.delete(plotId);
      } else {
        newSet.add(plotId);
      }
      return newSet;
    });
  };

  const filteredData = pricingData.filter(loc => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;

    return (
      loc.location_name.toLowerCase().includes(query) ||
      (loc.colony_category || '').toLowerCase().includes(query) ||
      String(loc.circle_rate || '').toLowerCase().includes(query) ||
      loc.plots.some(plot =>
        String(plot.plot_size).includes(query) ||
        String(plot.price_per_sq_yard || '').toLowerCase().includes(query) ||
        String(plot.min_price || '').includes(query) ||
        String(plot.max_price || '').includes(query) ||
        plot.floors.some(floor =>
          floor.floor_label.toLowerCase().includes(query) ||
          String(floor.tentative_floor_price || '').toLowerCase().includes(query)
        )
      )
    );
  });

  const plotCount = filteredData.reduce((sum, loc) => sum + loc.plots.length, 0);
  const floorCount = filteredData.reduce(
    (sum, loc) => sum + loc.plots.reduce((plotSum, plot) => plotSum + plot.floors.length, 0),
    0
  );

  const resetForm = () => {
    setSelectedLocation(null);
    setPlotSize('');
    setPricePerSqYard('');
    setMinPrice('');
    setMaxPrice('');
    setFloors([{ floor_label: '', tentative_floor_price: '' }]);
  };

  const handleAddFloor = () => {
    setFloors([...floors, { floor_label: '', tentative_floor_price: '' }]);
  };

  const handleRemoveFloor = (index: number) => {
    if (floors.length > 1) {
      setFloors(floors.filter((_, i) => i !== index));
    }
  };

  const updateFloor = (index: number, field: 'floor_label' | 'tentative_floor_price', value: string) => {
    const newFloors = [...floors];
    newFloors[index][field] = value;
    setFloors(newFloors);
  };

  const handleSave = async () => {
    if (!selectedLocation) {
      Alert.alert('Error', 'Please select a location');
      return;
    }
    if (!plotSize || !pricePerSqYard || !minPrice || !maxPrice) {
      Alert.alert('Error', 'Please fill all required fields');
      return;
    }

    setSaving(true);
    try {
      const data = {
        location_id: selectedLocation.id,
        circle: selectedLocation.circle_rate?.toString() || '',
        plot_size: parseInt(plotSize),
        price_per_sq_yard: pricePerSqYard,
        min_price: parseFloat(minPrice),
        max_price: parseFloat(maxPrice),
        floors: floors.filter(f => f.floor_label && f.tentative_floor_price),
      };

      if (editingPlot) {
        await api.updatePricing(editingPlot.id, data);
        Alert.alert('Success', 'Pricing updated successfully');
      } else {
        await api.createPricing(data);
        Alert.alert('Success', 'Pricing created successfully');
      }

      setShowAddModal(false);
      setShowEditModal(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(
        'Error',
        error instanceof Error && error.message ? error.message : 'Failed to save pricing'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (plot: PlotPricing, locationId: number) => {
    const location = locations.find(l => l.id === locationId);
    setSelectedLocation(location || null);
    setEditingPlot(plot);
    setPlotSize(plot.plot_size.toString());
    setPricePerSqYard(plot.price_per_sq_yard);
    setMinPrice(plot.min_price.toString());
    setMaxPrice(plot.max_price.toString());
    setFloors(plot.floors.length > 0 ? plot.floors : [{ floor_label: '', tentative_floor_price: '' }]);
    setShowEditModal(true);
  };

  const handleDelete = (plotId: number) => {
    Alert.alert(
      'Delete Pricing',
      'Are you sure you want to delete this pricing entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deletePricing(plotId);
              loadData();
            } catch (error) {
              Alert.alert(
                'Error',
                error instanceof Error && error.message ? error.message : 'Failed to delete pricing'
              );
            }
          },
        },
      ]
    );
  };

  const formatIndianNumber = (value: number | string) => {
    const numeric = typeof value === 'string' ? Number(value.replace(/[^\d.]/g, '')) : Number(value);
    if (!Number.isFinite(numeric)) return String(value || 'N/A');
    return numeric.toLocaleString('en-IN');
  };

  const formatCircleRate = (rate: number | string) => {
    const numRate = typeof rate === 'string' ? Number(rate.replace(/[^\d.]/g, '')) : rate;
    if (numRate >= 100000) {
      const lakhValue = Number((numRate / 100000).toFixed(1));
      return `₹${formatIndianNumber(numRate)}/sq mtr aprx ${lakhValue} L`;
    }
    return numRate ? `₹${formatIndianNumber(numRate)}/sq mtr` : 'N/A';
  };

  const renderPlotCard = (plot: PlotPricing, locationId: number) => {
    const floorsExpanded = expandedPlots.has(plot.id);

    return (
    <View key={plot.id} style={styles.plotCard}>
      <View style={styles.plotHeader}>
        <View style={styles.plotSizeContainer}>
          <Ionicons name="scan-outline" size={16} color="#B7791F" />
          <Text style={styles.plotSize}>{plot.plot_size} sq yds</Text>
        </View>
        <View style={styles.plotActions}>
          <TouchableOpacity
            onPress={() => togglePlotFloors(plot.id)}
            style={[styles.actionBtn, floorsExpanded && styles.actionBtnActive]}
          >
            <Ionicons name="list" size={18} color={floorsExpanded ? '#fff' : '#0F2A44'} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleEdit(plot, locationId)} style={styles.actionBtn}>
            <Ionicons name="create-outline" size={18} color="#0F2A44" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDelete(plot.id)} style={styles.actionBtn}>
            <Ionicons name="trash" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
      
      <View style={styles.plotDetails}>
        <Text style={styles.priceRange}>₹{plot.min_price} - {plot.max_price} CR</Text>
        <Text style={styles.plotRate}>Plot price: ₹{plot.price_per_sq_yard} lac per sq yard</Text>
      </View>

      {floorsExpanded && (
        <View style={styles.floorsContainer}>
          {plot.floors.length > 0 ? (
            plot.floors.map((floor, idx) => (
              <View key={idx} style={styles.floorItem}>
                <View style={styles.floorLabelGroup}>
                  <Ionicons name="home" size={16} color="#6B7280" />
                  <Text style={styles.floorLabel}>{floor.floor_label}</Text>
                </View>
                <Text style={styles.floorPrice}>₹{floor.tentative_floor_price} CR</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyFloorText}>No specific floor pricing added.</Text>
          )}
        </View>
      )}
    </View>
    );
  };

  const renderLocationCard = ({ item }: { item: LocationPricing }) => {
    const isExpanded = expandedLocations.has(item.location_name);
    
    return (
      <View style={styles.locationCard}>
        <TouchableOpacity
          style={styles.locationHeader}
          onPress={() => toggleLocation(item.location_name)}
        >
          <View style={styles.locationInfo}>
            <Text style={styles.locationName}>{item.location_name}</Text>
            <View style={styles.locationMeta}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{item.colony_category || 'N/A'}</Text>
              </View>
              <Text style={styles.circleRate}>
                Circle Rate: {formatCircleRate(item.circle_rate)}
              </Text>
            </View>
          </View>
          <View style={styles.expandContainer}>
            <View style={styles.plotCountBadge}>
              <Text style={styles.plotCountText}>{item.plots.length}</Text>
            </View>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={24}
              color="#6B7280"
            />
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.plotsList}>
            {item.plots.map(plot => renderPlotCard(plot, item.location_id))}
          </View>
        )}
      </View>
    );
  };

  const renderFormModal = (isEdit: boolean) => (
    <Modal
      visible={isEdit ? showEditModal : showAddModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.modalContainer}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isEdit ? 'Edit Plot Pricing' : 'Add Plot Pricing'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (isEdit) {
                  setShowEditModal(false);
                } else {
                  setShowAddModal(false);
                }
                resetForm();
                setEditingPlot(null);
              }}
            >
              <Ionicons name="close" size={24} color="#1F2937" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formContainer}>
            {/* Location Picker */}
            <Text style={styles.formLabel}>Location *</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowLocationPicker(true)}
            >
              <Text style={selectedLocation ? styles.pickerText : styles.pickerPlaceholder}>
                {selectedLocation?.name || 'Select Location'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>

            {selectedLocation && (
              <View style={styles.circleRateDisplay}>
                <Text style={styles.circleRateLabel}>Circle Rate:</Text>
                <Text style={styles.circleRateValue}>
                  Rs. {selectedLocation.circle_rate?.toLocaleString('en-IN') || 'N/A'} /sq mtr
                </Text>
              </View>
            )}

            {/* Plot Size */}
            <Text style={styles.formLabel}>Plot Size (sq yds) *</Text>
            <TextInput
              style={styles.input}
              value={plotSize}
              onChangeText={setPlotSize}
              placeholder="e.g. 400"
              keyboardType="numeric"
              placeholderTextColor="#9CA3AF"
            />

            {/* Price per Sq Yard */}
            <Text style={styles.formLabel}>Price/Sq Yd Range (Lac) *</Text>
            <TextInput
              style={styles.input}
              value={pricePerSqYard}
              onChangeText={setPricePerSqYard}
              placeholder="e.g. 12-13 or 12.00"
              placeholderTextColor="#9CA3AF"
            />

            {/* Price Range */}
            <Text style={styles.formLabel}>Total Price Range (Cr) *</Text>
            <View style={styles.rangeContainer}>
              <TextInput
                style={[styles.input, styles.rangeInput]}
                value={minPrice}
                onChangeText={setMinPrice}
                placeholder="Min"
                keyboardType="decimal-pad"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.rangeSeparator}>to</Text>
              <TextInput
                style={[styles.input, styles.rangeInput]}
                value={maxPrice}
                onChangeText={setMaxPrice}
                placeholder="Max"
                keyboardType="decimal-pad"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            {/* Floor-wise Pricing */}
            <View style={styles.floorsSection}>
              <Text style={styles.formLabel}>Floor-wise Tentative Prices (Cr)</Text>
              {floors.map((floor, index) => (
                <View key={index} style={styles.floorInputRow}>
                  <TouchableOpacity
                    style={styles.floorPickerBtn}
                    onPress={() => {
                      Alert.alert(
                        'Select Floor',
                        '',
                        FLOOR_OPTIONS.map(opt => ({
                          text: opt,
                          onPress: () => updateFloor(index, 'floor_label', opt),
                        }))
                      );
                    }}
                  >
                    <Text style={floor.floor_label ? styles.pickerText : styles.pickerPlaceholder}>
                      {floor.floor_label || 'Floor'}
                    </Text>
                    <Ionicons name="chevron-down" size={16} color="#6B7280" />
                  </TouchableOpacity>
                  
                  <TextInput
                    style={[styles.input, styles.floorPriceInput]}
                    value={floor.tentative_floor_price}
                    onChangeText={(v) => updateFloor(index, 'tentative_floor_price', v)}
                    placeholder="Price (Cr)"
                    keyboardType="decimal-pad"
                    placeholderTextColor="#9CA3AF"
                  />
                  
                  <TouchableOpacity
                    style={styles.removeFloorBtn}
                    onPress={() => handleRemoveFloor(index)}
                  >
                    <Ionicons name="close-circle" size={24} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
              
              <TouchableOpacity style={styles.addFloorBtn} onPress={handleAddFloor}>
                <Ionicons name="add-circle" size={20} color="#3B82F6" />
                <Text style={styles.addFloorText}>Add Floor</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Save Button */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {isEdit ? 'Update Pricing' : 'Add Pricing'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Location Picker Modal */}
      <Modal visible={showLocationPicker} animationType="slide" transparent>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerModal}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Select Location</Text>
              <TouchableOpacity onPress={() => setShowLocationPicker(false)}>
                <Ionicons name="close" size={24} color="#1F2937" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={locations}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.locationPickerItem}
                  onPress={() => {
                    setSelectedLocation(item);
                    setShowLocationPicker(false);
                  }}
                >
                  <Text style={styles.locationPickerName}>{item.name}</Text>
                  <Text style={styles.locationPickerMeta}>
                    {item.colony_category} • Rs. {item.circle_rate?.toLocaleString('en-IN')}
                  </Text>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 400 }}
            />
          </View>
        </View>
      </Modal>
    </Modal>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading pricing data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>Location Pricing</Text>
          <Text style={styles.title}>Plot & Floor Pricing</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            resetForm();
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search location, category, plot, or floor..."
          placeholderTextColor="#9CA3AF"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{filteredData.length}</Text>
          <Text style={styles.statLabel}>Locations</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {plotCount}
          </Text>
          <Text style={styles.statLabel}>Plot Entries</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{floorCount}</Text>
          <Text style={styles.statLabel}>Floor Prices</Text>
        </View>
      </View>

      {/* Result Count */}
      {searchQuery && (
        <View style={styles.resultCountContainer}>
          <Text style={styles.resultCountText}>
            Showing {filteredData.length} of {pricingData.length} locations
          </Text>
        </View>
      )}

      {/* List */}
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.location_name}
        renderItem={renderLocationCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calculator-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No pricing data found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try a different search term' : 'Tap + to add pricing'}
            </Text>
          </View>
        }
      />

      {/* Modals */}
      {renderFormModal(false)}
      {renderFormModal(true)}
    </SafeAreaView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#071B33',
  },
  headerEyebrow: {
    color: '#A16207',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  addButton: {
    backgroundColor: '#3B82F6',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    marginLeft: 8,
    fontSize: 16,
    color: '#1F2937',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#17324D',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5E7EB',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  locationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  locationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  locationMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    backgroundColor: '#F8FAFC',
    borderColor: '#DDE7F2',
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#17324D',
  },
  circleRate: {
    fontSize: 12,
    color: '#6B7280',
  },
  expandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  plotCountBadge: {
    backgroundColor: '#17324D',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  plotCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  plotsList: {
    padding: 12,
  },
  plotCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DDE7F2',
  },
  plotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  plotSizeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#DDE7F2',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  plotSize: {
    fontSize: 16,
    fontWeight: '800',
    color: '#071B33',
    marginLeft: 6,
  },
  plotActions: {
    flexDirection: 'row',
  },
  actionBtn: {
    alignItems: 'center',
    backgroundColor: '#EEF3F8',
    borderColor: '#DDE7F2',
    borderRadius: 10,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    marginLeft: 8,
    width: 36,
  },
  actionBtnActive: {
    backgroundColor: '#17324D',
    borderColor: '#17324D',
  },
  plotDetails: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2EAF4',
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    padding: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1F2937',
  },
  priceRange: {
    color: '#071B33',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  plotRate: {
    color: '#526175',
    fontSize: 14,
    fontWeight: '700',
  },
  floorsContainer: {
    backgroundColor: '#F6F9FC',
    borderTopColor: '#DDE7F2',
    borderTopWidth: 1,
    marginHorizontal: -12,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  floorItem: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderColor: '#E2EAF4',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  floorLabelGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    minWidth: 0,
  },
  floorLabel: {
    color: '#445572',
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },
  floorPrice: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E5ECF5',
    borderRadius: 999,
    borderWidth: 1,
    color: '#071B33',
    fontSize: 14,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  emptyFloorText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '700',
    paddingBottom: 10,
    textAlign: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
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
    marginTop: 4,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
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
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  formContainer: {
    flex: 1,
    padding: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#fff',
  },
  pickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  pickerText: {
    fontSize: 16,
    color: '#1F2937',
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  circleRateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
  },
  circleRateLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  circleRateValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    marginLeft: 4,
  },
  rangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rangeInput: {
    flex: 1,
  },
  rangeSeparator: {
    marginHorizontal: 12,
    color: '#6B7280',
  },
  floorsSection: {
    marginTop: 16,
    marginBottom: 24,
  },
  floorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  floorPickerBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 12,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  floorPriceInput: {
    flex: 1,
    marginRight: 8,
  },
  removeFloorBtn: {
    padding: 4,
  },
  addFloorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 8,
  },
  addFloorText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
    marginLeft: 6,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Location Picker Modal
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pickerModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  locationPickerItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  locationPickerName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  locationPickerMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  resultCountContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
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
});
