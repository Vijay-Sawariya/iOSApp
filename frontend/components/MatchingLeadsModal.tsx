import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LOCATIONS, FLOORS, formatFloorPricing, formatUnit } from '../constants/leadOptions';
import { offlineApi } from '../services/offlineApi';

type MatchMode = 'inventory' | 'clients';

interface MatchingLeadsModalProps {
  visible: boolean;
  lead: any | null;
  mode: MatchMode;
  onClose: () => void;
  onSaved?: () => void;
}

const toText = (value: any) => (value === null || value === undefined ? '' : String(value));
const splitCsv = (value: any) => toText(value).split(',').map((item) => item.trim()).filter(Boolean);

// Format date as dd/mm/yy
const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

// Compose WhatsApp message for inventory details (matching PHP function)
const composeInventoryWhatsappMessage = (data: any) => {
  const currentHour = new Date().getHours();
  const greeting = currentHour >= 17 ? 'Good Evening' : (currentHour >= 12 ? 'Good Afternoon' : 'Good Morning');
  
  let msg = `*Hi Sir, ${greeting}*\n\n`;
  msg += 'I\'m sharing a few premium residences with you that might be of interest. These homes offer good privacy, elegant design, and are in a prime neighbourhood.\n\n';

  // Location (without address for privacy)
  msg += `Location: ${data.location || ''}\n`;
  msg += `Plot Area: ${data.area_size || ''} sq. yds\n`;
  
  if (data.building_facing) { 
    msg += `Plot Facing: ${data.building_facing}\n`; 
  }
  
  msg += `Floor: ${data.floor || ''} | Total BHKs: It has ${data.bhk || ''} | Parking: ${data.car_parking_number || '0'} cars parking available\n`;
  msg += `Development Status: It is ${data.lead_status || ''} property\n`;
  
  if (data.possession_on && data.possession_on !== '0000-00-00') { 
    msg += `Possession On: ${formatDate(data.possession_on)}\n`; 
  }
  
  if (data.property_age) { 
    msg += `Property Age: ${data.property_age} years\n`; 
  }
  
  if (data.notes) { 
    msg += `Special Features: ${data.notes}\n`; 
  }

  // Floor-wise pricing
  if (data.floor_pricing && data.floor_pricing.length > 0) {
    msg += `Floor-wise Pricing:\n`;
    data.floor_pricing.forEach((fp: any) => {
      msg += `• ${fp.floor}: ₹${fp.price} ${data.unit || 'CR'}\n`;
    });
    msg += `(All prices are negotiable)\n\n`;
  } else if (data.budget_max) {
    msg += `Asking Price: ${data.budget_max} ${formatUnit(data.unit)} (Negotiable)\n\n`;
  }
  
  msg += '*Would be happy to arrange a site visit at your convenience. Please let me know a suitable day and time.*';
  return msg;
};

// Compose message for multiple inventories
const composeMultipleInventoriesMessage = (inventories: any[]) => {
  const currentHour = new Date().getHours();
  const greeting = currentHour >= 17 ? 'Good Evening' : (currentHour >= 12 ? 'Good Afternoon' : 'Good Morning');
  
  let msg = `*Hi Sir, ${greeting}*\n\n`;
  msg += `I'm sharing ${inventories.length} premium residences with you that might be of interest. These homes offer good privacy, elegant design, and are in prime neighbourhoods.\n\n`;
  
  inventories.forEach((data, index) => {
    msg += `*Property ${index + 1}:*\n`;
    msg += `📍 Location: ${data.location || ''}\n`;
    msg += `📐 Plot Area: ${data.area_size || ''} sq. yds\n`;
    
    if (data.building_facing) { 
      msg += `🧭 Facing: ${data.building_facing}\n`; 
    }
    
    msg += `🏠 Floor: ${data.floor || ''} | BHK: ${data.bhk || ''} | Parking: ${data.car_parking_number || '0'}\n`;
    msg += `📋 Status: ${data.lead_status || ''}\n`;
    
    // Floor-wise pricing
    if (data.floor_pricing && data.floor_pricing.length > 0) {
      msg += `💰 Pricing:\n`;
      data.floor_pricing.forEach((fp: any) => {
        msg += `   • ${fp.floor}: ₹${fp.price} ${data.unit || 'CR'}\n`;
      });
    } else if (data.budget_max) {
      msg += `💰 Price: ${data.budget_max} ${formatUnit(data.unit)} (Negotiable)\n`;
    }
    
    if (data.notes) { 
      msg += `✨ Features: ${data.notes}\n`; 
    }
    
    msg += `\n`;
  });
  
  msg += '*Would be happy to arrange site visits at your convenience. Please let me know a suitable day and time.*';
  return msg;
};

const defaultFiltersFromLead = (lead: any) => {
  const area = Number.parseFloat(toText(lead?.area_size));
  const budgetMin = Number.parseFloat(toText(lead?.budget_min));
  const budgetMax = Number.parseFloat(toText(lead?.budget_max));
  return {
    locations: splitCsv(lead?.location),
    floors: splitCsv(lead?.floor),
    area_min: Number.isFinite(area) ? String(Math.max(0, area - 100)) : '',
    area_max: Number.isFinite(area) ? String(area + 100) : '',
    budget_min: Number.isFinite(budgetMin) ? String(Number((budgetMin * 0.8).toFixed(2))) : '',
    budget_max: Number.isFinite(budgetMax) ? String(Number((budgetMax * 1.2).toFixed(2))) : '',
  };
};

export default function MatchingLeadsModal({ visible, lead, mode, onClose, onSaved }: MatchingLeadsModalProps) {
  const [filters, setFilters] = useState(defaultFiltersFromLead(null));
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [floorSearch, setFloorSearch] = useState('');
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showFloorDropdown, setShowFloorDropdown] = useState(false);

  const title = mode === 'inventory' ? 'Matching Inventories' : 'Matching Clients';
  const targetLabel = mode === 'inventory' ? 'inventory' : 'clients';

  const filteredLocations = useMemo(
    () => LOCATIONS.filter((item) => item.toLowerCase().includes(locationSearch.toLowerCase())),
    [locationSearch]
  );

  const filteredFloors = useMemo(
    () => FLOORS.filter((item) => item.toLowerCase().includes(floorSearch.toLowerCase())),
    [floorSearch]
  );

  // Reset state when modal opens
  useEffect(() => {
    if (visible && lead?.id) {
      const nextFilters = defaultFiltersFromLead(lead);
      setFilters(nextFilters);
      setSelectedIds([]);
      setMatches([]);
      setLocationSearch('');
      setFloorSearch('');
      setShowLocationDropdown(false);
      setShowFloorDropdown(false);
      // Small delay to ensure state is set before loading
      const timer = setTimeout(() => {
        loadMatches(nextFilters);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [visible, lead?.id]);

  const loadMatches = useCallback(async (activeFilters = filters) => {
    if (!lead?.id) return;
    setLoading(true);
    try {
      const payload = mode === 'inventory'
        ? await offlineApi.getMatchingInventory(lead.id, activeFilters)
        : await offlineApi.getMatchingClients(lead.id, activeFilters);
      const rows = payload?.matches || [];
      setMatches(rows);
      setSelectedIds(rows.filter((row: any) => row.is_preferred).map((row: any) => row.id));
      if (payload?.filters) {
        setFilters({
          locations: payload.filters.locations || [],
          floors: payload.filters.floors || [],
          area_min: toText(payload.filters.area_min),
          area_max: toText(payload.filters.area_max),
          budget_min: toText(payload.filters.budget_min),
          budget_max: toText(payload.filters.budget_max),
        });
      }
    } catch (error: any) {
      console.error('Load matches error:', error);
      Alert.alert('Matching Unavailable', error?.message || `Failed to fetch matching ${targetLabel}.`);
    } finally {
      setLoading(false);
    }
  }, [lead?.id, mode, targetLabel]);

  const toggleSelected = (id: number) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const toggleFilterValue = (key: 'locations' | 'floors', value: string) => {
    setFilters((current) => {
      const currentValues = current[key];
      return {
        ...current,
        [key]: currentValues.includes(value)
          ? currentValues.filter((item) => item !== value)
          : [...currentValues, value],
      };
    });
  };

  const removeFilterValue = (key: 'locations' | 'floors', value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: current[key].filter((item) => item !== value),
    }));
  };

  const updateTextFilter = (key: 'area_min' | 'area_max' | 'budget_min' | 'budget_max', value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const saveSelected = async () => {
    if (!lead?.id || selectedIds.length === 0) {
      Alert.alert('Select Matches', `Select at least one ${targetLabel.slice(0, -1)}.`);
      return;
    }
    setSaving(true);
    try {
      const result = await offlineApi.addPreferredLeads(lead.id, selectedIds);
      Alert.alert('Saved', `${result?.added ?? selectedIds.length} matching lead(s) saved.`);
      onSaved?.();
      await loadMatches();
    } catch (error: any) {
      Alert.alert('Save Failed', error?.message || 'Could not save preferred leads.');
    } finally {
      setSaving(false);
    }
  };

  // Share selected inventories via WhatsApp
  const shareViaWhatsApp = async () => {
    if (selectedIds.length === 0) {
      Alert.alert('Select Properties', 'Please select at least one property to share.');
      return;
    }

    if (!lead?.phone) {
      Alert.alert('No Phone Number', 'Lead does not have a phone number to send WhatsApp message.');
      return;
    }

    setSharing(true);
    try {
      // Get the selected inventory details
      const selectedInventories = matches.filter((m) => selectedIds.includes(m.id));
      
      // Compose message
      let message: string;
      if (selectedInventories.length === 1) {
        message = composeInventoryWhatsappMessage(selectedInventories[0]);
      } else {
        message = composeMultipleInventoriesMessage(selectedInventories);
      }

      // Format phone number
      const cleanPhone = toText(lead.phone).replace(/[^0-9]/g, '');
      const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;

      // Open WhatsApp
      const whatsappUrl = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`;
      
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('WhatsApp Error', 'Could not open WhatsApp. Please make sure it is installed.');
      }
    } catch (error: any) {
      console.error('Share error:', error);
      Alert.alert('Share Failed', error?.message || 'Could not share via WhatsApp.');
    } finally {
      setSharing(false);
    }
  };

  const renderMatch = ({ item }: { item: any }) => {
    const checked = selectedIds.includes(item.id);
    const priceText = item.floor_pricing?.length
      ? formatFloorPricing(item.floor_pricing, item.unit)
      : [item.budget_min, item.budget_max].filter(Boolean).length > 0
        ? `Rs. ${[item.budget_min, item.budget_max].filter(Boolean).join(' - ')} ${formatUnit(item.unit)}`
        : 'Price on request';

    return (
      <TouchableOpacity style={[styles.matchCard, checked && styles.matchCardSelected]} onPress={() => toggleSelected(item.id)}>
        <View style={styles.matchHeader}>
          <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? '#2563EB' : '#94A3B8'} />
          <View style={styles.matchTitleWrap}>
            <Text style={styles.matchName}>{toText(item.name) || `Lead ${item.id}`}</Text>
            <Text style={styles.matchMeta}>
              {[item.lead_type, item.created_by_name ? `Gen By ${item.created_by_name}` : null].filter(Boolean).join(' • ')}
            </Text>
          </View>
          <TouchableOpacity style={styles.openButton} onPress={() => router.push(`/leads/${item.id}` as any)}>
            <Ionicons name="open-outline" size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>

        <View style={styles.detailLine}>
          <Ionicons name="location-outline" size={15} color="#64748B" />
          <Text style={styles.detailText} numberOfLines={2}>{[item.address, item.location].filter(Boolean).join(', ') || 'No location'}</Text>
        </View>
        <View style={styles.tagRow}>
          {[item.area_size ? `${item.area_size} sq yds` : null, item.floor, item.bhk, item.lead_status].filter(Boolean).map((tag, idx) => (
            <View key={`${tag}-${idx}`} style={styles.tag}>
              <Text style={styles.tagText}>{String(tag)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.priceText}>{priceText}</Text>
        {Array.isArray(item.match_reasons) && item.match_reasons.length > 0 ? (
          <Text style={styles.reasonsText}>{item.match_reasons.join(' • ')}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  // Render selected pills
  const renderSelectedPills = (key: 'locations' | 'floors') => {
    const items = filters[key];
    if (items.length === 0) return null;
    
    return (
      <View style={styles.selectedPillsContainer}>
        {items.map((item) => (
          <View key={item} style={styles.selectedPill}>
            <Text style={styles.selectedPillText}>{item}</Text>
            <TouchableOpacity onPress={() => removeFilterValue(key, item)} style={styles.pillRemoveBtn}>
              <Ionicons name="close-circle" size={16} color="#2563EB" />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{toText(lead?.name)}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.filters} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
          <Text style={styles.filterTitle}>Search Criteria</Text>
          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={styles.label}>Area min</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={filters.area_min} onChangeText={(text) => updateTextFilter('area_min', text)} />
            </View>
            <View style={styles.inputHalf}>
              <Text style={styles.label}>Area max</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={filters.area_max} onChangeText={(text) => updateTextFilter('area_max', text)} />
            </View>
          </View>
          <View style={styles.inputRow}>
            <View style={styles.inputHalf}>
              <Text style={styles.label}>Budget min</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={filters.budget_min} onChangeText={(text) => updateTextFilter('budget_min', text)} />
            </View>
            <View style={styles.inputHalf}>
              <Text style={styles.label}>Budget max</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={filters.budget_max} onChangeText={(text) => updateTextFilter('budget_max', text)} />
            </View>
          </View>

          {/* Location Multi-select Dropdown */}
          <Text style={styles.label}>Locations ({filters.locations.length} selected)</Text>
          {renderSelectedPills('locations')}
          <TouchableOpacity 
            style={styles.dropdownTrigger} 
            onPress={() => {
              setShowLocationDropdown(!showLocationDropdown);
              setShowFloorDropdown(false);
            }}
          >
            <Text style={styles.dropdownTriggerText}>
              {filters.locations.length > 0 ? 'Tap to modify selections' : 'Select locations...'}
            </Text>
            <Ionicons name={showLocationDropdown ? 'chevron-up' : 'chevron-down'} size={20} color="#64748B" />
          </TouchableOpacity>
          
          {showLocationDropdown && (
            <View style={styles.dropdownContainer}>
              <TextInput 
                style={styles.dropdownSearch} 
                placeholder="Search locations..." 
                value={locationSearch} 
                onChangeText={setLocationSearch}
                autoCapitalize="none"
              />
              <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                {filteredLocations.map((item) => (
                  <TouchableOpacity 
                    key={item} 
                    style={[styles.dropdownItem, filters.locations.includes(item) && styles.dropdownItemSelected]} 
                    onPress={() => toggleFilterValue('locations', item)}
                  >
                    <Ionicons 
                      name={filters.locations.includes(item) ? 'checkbox' : 'square-outline'} 
                      size={20} 
                      color={filters.locations.includes(item) ? '#2563EB' : '#94A3B8'} 
                    />
                    <Text style={[styles.dropdownItemText, filters.locations.includes(item) && styles.dropdownItemTextSelected]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Floor Multi-select Dropdown */}
          <Text style={[styles.label, { marginTop: 12 }]}>Floors ({filters.floors.length} selected)</Text>
          {renderSelectedPills('floors')}
          <TouchableOpacity 
            style={styles.dropdownTrigger} 
            onPress={() => {
              setShowFloorDropdown(!showFloorDropdown);
              setShowLocationDropdown(false);
            }}
          >
            <Text style={styles.dropdownTriggerText}>
              {filters.floors.length > 0 ? 'Tap to modify selections' : 'Select floors...'}
            </Text>
            <Ionicons name={showFloorDropdown ? 'chevron-up' : 'chevron-down'} size={20} color="#64748B" />
          </TouchableOpacity>
          
          {showFloorDropdown && (
            <View style={styles.dropdownContainer}>
              <TextInput 
                style={styles.dropdownSearch} 
                placeholder="Search floors..." 
                value={floorSearch} 
                onChangeText={setFloorSearch}
                autoCapitalize="none"
              />
              <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                {filteredFloors.map((item) => (
                  <TouchableOpacity 
                    key={item} 
                    style={[styles.dropdownItem, filters.floors.includes(item) && styles.dropdownItemSelected]} 
                    onPress={() => toggleFilterValue('floors', item)}
                  >
                    <Ionicons 
                      name={filters.floors.includes(item) ? 'checkbox' : 'square-outline'} 
                      size={20} 
                      color={filters.floors.includes(item) ? '#2563EB' : '#94A3B8'} 
                    />
                    <Text style={[styles.dropdownItemText, filters.floors.includes(item) && styles.dropdownItemTextSelected]}>
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <TouchableOpacity style={styles.applyButton} onPress={() => loadMatches()}>
            <Ionicons name="search-outline" size={18} color="#FFFFFF" />
            <Text style={styles.applyButtonText}>Fetch Records</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.resultsHeader}>
          <Text style={styles.resultsText}>{matches.length} record(s)</Text>
          <Text style={styles.selectedText}>{selectedIds.length} selected</Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Fetching matches...</Text>
          </View>
        ) : (
          <FlatList
            data={matches}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderMatch}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={<Text style={styles.emptyText}>No matching records found.</Text>}
            removeClippedSubviews={Platform.OS === 'ios'}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </TouchableOpacity>
          
          {/* Share Button */}
          <TouchableOpacity 
            style={[styles.shareButton, (sharing || selectedIds.length === 0) && styles.shareButtonDisabled]} 
            onPress={shareViaWhatsApp} 
            disabled={sharing || selectedIds.length === 0}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.saveButton, (saving || selectedIds.length === 0) && styles.saveButtonDisabled]} 
            onPress={saveSelected} 
            disabled={saving || selectedIds.length === 0}
          >
            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="star" size={18} color="#FFFFFF" />}
            <Text style={styles.saveButtonText}>Add</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 18,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 3,
    color: '#64748B',
    fontSize: 13,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filters: {
    maxHeight: 380,
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 10,
  },
  inputHalf: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  // Selected Pills
  selectedPillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DBEAFE',
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  selectedPillText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '600',
  },
  pillRemoveBtn: {
    padding: 2,
  },
  // Dropdown Styles
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
  },
  dropdownTriggerText: {
    color: '#64748B',
    fontSize: 14,
  },
  dropdownContainer: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    maxHeight: 200,
  },
  dropdownSearch: {
    minHeight: 40,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 12,
    color: '#0F172A',
  },
  dropdownList: {
    maxHeight: 150,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  dropdownItemText: {
    color: '#334155',
    fontSize: 14,
  },
  dropdownItemTextSelected: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  applyButton: {
    marginTop: 14,
    marginBottom: 18,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  applyButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  resultsHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  resultsText: {
    color: '#475569',
    fontWeight: '700',
  },
  selectedText: {
    color: '#2563EB',
    fontWeight: '800',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    color: '#64748B',
  },
  listContent: {
    padding: 14,
    paddingBottom: 120,
  },
  emptyText: {
    paddingVertical: 34,
    textAlign: 'center',
    color: '#64748B',
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  matchCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  matchTitleWrap: {
    flex: 1,
  },
  matchName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  matchMeta: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
  },
  openButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
  },
  detailLine: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 6,
  },
  detailText: {
    flex: 1,
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tagText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  priceText: {
    marginTop: 10,
    color: '#047857',
    fontSize: 13,
    fontWeight: '800',
  },
  reasonsText: {
    marginTop: 6,
    color: '#64748B',
    fontSize: 12,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  secondaryButtonText: {
    color: '#334155',
    fontWeight: '800',
  },
  shareButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#25D366',
  },
  shareButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  shareButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  saveButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#2563EB',
  },
  saveButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
