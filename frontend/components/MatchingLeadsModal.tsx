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

// Format floor pricing for display like: GF: ₹6 Cr | FF: ₹6 Cr | SF: ₹6 Cr
const formatFloorPricingInline = (floorPricing: any[], unit: string) => {
  if (!floorPricing || floorPricing.length === 0) return '';
  return floorPricing.map((fp: any) => `${fp.floor}: ₹${fp.price} ${unit || 'Cr'}`).join(' | ');
};

// Compose WhatsApp message for inventory details (matching PHP function)
const composeInventoryWhatsappMessage = (data: any) => {
  const currentHour = new Date().getHours();
  const greeting = currentHour >= 17 ? 'Good Evening' : (currentHour >= 12 ? 'Good Afternoon' : 'Good Morning');
  
  let msg = `*Hi Sir, ${greeting}*\n\n`;
  msg += 'I\'m sharing a few premium residences with you that might be of interest. These homes offer good privacy, elegant design, and are in a prime neighbourhood.\n\n';

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
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showFloorDropdown, setShowFloorDropdown] = useState(false);

  const title = mode === 'inventory' ? 'Matching Inventories' : 'Matching Clients';
  const targetLabel = mode === 'inventory' ? 'inventory' : 'clients';

  const filteredLocations = useMemo(
    () => LOCATIONS.filter((item) => item.toLowerCase().includes(locationSearch.toLowerCase())),
    [locationSearch]
  );

  // Reset state when modal opens
  useEffect(() => {
    if (visible && lead?.id) {
      const nextFilters = defaultFiltersFromLead(lead);
      setFilters(nextFilters);
      setSelectedIds([]);
      setMatches([]);
      setLocationSearch('');
      setShowLocationDropdown(false);
      setShowFloorDropdown(false);
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
      const selectedInventories = matches.filter((m) => selectedIds.includes(m.id));
      
      let message: string;
      if (selectedInventories.length === 1) {
        message = composeInventoryWhatsappMessage(selectedInventories[0]);
      } else {
        message = composeMultipleInventoriesMessage(selectedInventories);
      }

      const cleanPhone = toText(lead.phone).replace(/[^0-9]/g, '');
      const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
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
    
    // Format floor pricing inline
    const floorPricingText = item.floor_pricing?.length
      ? formatFloorPricingInline(item.floor_pricing, item.unit)
      : item.budget_max 
        ? `₹${item.budget_max} ${formatUnit(item.unit)}`
        : 'Price on request';

    return (
      <TouchableOpacity 
        style={[styles.matchCard, checked && styles.matchCardSelected]} 
        onPress={() => toggleSelected(item.id)}
        activeOpacity={0.7}
      >
        {/* Header Row */}
        <View style={styles.matchHeader}>
          <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
            {checked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
          </View>
          <View style={styles.matchTitleWrap}>
            <Text style={styles.matchName}>{toText(item.name) || `Lead ${item.id}`}</Text>
            <Text style={styles.matchMeta}>
              {[item.lead_type, item.created_by_name ? `Gen By ${item.created_by_name}` : null].filter(Boolean).join(' • ')}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.openButton} 
            onPress={(e) => {
              e.stopPropagation();
              router.push(`/leads/${item.id}` as any);
            }}
          >
            <Ionicons name="open-outline" size={18} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* Location Row */}
        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color="#64748B" />
          <Text style={styles.locationText} numberOfLines={1}>
            {[item.address, item.location].filter(Boolean).join(', ') || 'No location'}
          </Text>
        </View>

        {/* Tags Row */}
        <View style={styles.tagRow}>
          {item.area_size && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.area_size} sq yds</Text>
            </View>
          )}
          {item.floor && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.floor}</Text>
            </View>
          )}
          {item.bhk && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.bhk}</Text>
            </View>
          )}
          {item.lead_status && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.lead_status}</Text>
            </View>
          )}
        </View>

        {/* Price Row */}
        <Text style={styles.priceText}>{floorPricingText}</Text>

        {/* Match Reasons */}
        {Array.isArray(item.match_reasons) && item.match_reasons.length > 0 && (
          <Text style={styles.reasonsText}>{item.match_reasons.join(' • ')}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{toText(lead?.name)}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Filters Section */}
        <View style={styles.filtersContainer}>
          {/* Location Dropdown */}
          <TouchableOpacity 
            style={styles.dropdownTrigger}
            onPress={() => {
              setShowLocationDropdown(!showLocationDropdown);
              setShowFloorDropdown(false);
            }}
          >
            <Text style={styles.dropdownLabel}>Locations</Text>
            <Ionicons name={showLocationDropdown ? 'chevron-up' : 'chevron-down'} size={20} color="#64748B" />
          </TouchableOpacity>

          {showLocationDropdown && (
            <View style={styles.dropdownContent}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search locations..."
                placeholderTextColor="#94A3B8"
                value={locationSearch}
                onChangeText={setLocationSearch}
              />
              <ScrollView style={styles.dropdownList} nestedScrollEnabled showsVerticalScrollIndicator>
                {filteredLocations.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.dropdownItem}
                    onPress={() => toggleFilterValue('locations', item)}
                  >
                    <View style={[styles.checkboxSmall, filters.locations.includes(item) && styles.checkboxSmallChecked]}>
                      {filters.locations.includes(item) && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.dropdownItemText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Floors Section */}
          <View style={styles.floorsSection}>
            <Text style={styles.floorsLabel}>Floors ({filters.floors.length} selected)</Text>
            {filters.floors.length > 0 && (
              <View style={styles.pillsContainer}>
                {filters.floors.map((floor) => (
                  <View key={floor} style={styles.pill}>
                    <Text style={styles.pillText}>{floor}</Text>
                    <TouchableOpacity onPress={() => removeFilterValue('floors', floor)}>
                      <Ionicons name="close-circle" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Floor Dropdown Trigger */}
          <TouchableOpacity 
            style={styles.dropdownTrigger}
            onPress={() => {
              setShowFloorDropdown(!showFloorDropdown);
              setShowLocationDropdown(false);
            }}
          >
            <Text style={styles.dropdownPlaceholder}>Tap to modify selections</Text>
            <Ionicons name={showFloorDropdown ? 'chevron-up' : 'chevron-down'} size={20} color="#64748B" />
          </TouchableOpacity>

          {showFloorDropdown && (
            <View style={styles.dropdownContent}>
              <ScrollView style={styles.dropdownListSmall} nestedScrollEnabled>
                {FLOORS.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={styles.dropdownItem}
                    onPress={() => toggleFilterValue('floors', item)}
                  >
                    <View style={[styles.checkboxSmall, filters.floors.includes(item) && styles.checkboxSmallChecked]}>
                      {filters.floors.includes(item) && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                    </View>
                    <Text style={styles.dropdownItemText}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Results Header */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsText}>{matches.length} record(s)</Text>
          <Text style={styles.selectedText}>{selectedIds.length} selected</Text>
        </View>

        {/* Results List */}
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

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.shareBtn, (sharing || selectedIds.length === 0) && styles.btnDisabled]} 
            onPress={shareViaWhatsApp} 
            disabled={sharing || selectedIds.length === 0}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
            )}
            <Text style={styles.shareBtnText}>Share</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.addBtn, (saving || selectedIds.length === 0) && styles.btnDisabled]} 
            onPress={saveSelected} 
            disabled={saving || selectedIds.length === 0}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="star" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.addBtnText}>Add</Text>
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
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 14,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    marginTop: 8,
  },
  dropdownLabel: {
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  dropdownPlaceholder: {
    fontSize: 14,
    color: '#94A3B8',
  },
  dropdownContent: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    marginTop: 4,
    maxHeight: 200,
  },
  searchInput: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    fontSize: 14,
    color: '#0F172A',
  },
  dropdownList: {
    maxHeight: 150,
  },
  dropdownListSmall: {
    maxHeight: 120,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#334155',
    marginLeft: 12,
  },
  checkboxSmall: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSmallChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  floorsSection: {
    marginTop: 16,
  },
  floorsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 8,
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  pillText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  resultsHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  resultsText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyText: {
    paddingVertical: 40,
    textAlign: 'center',
    color: '#64748B',
    fontSize: 15,
  },
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  matchCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#F8FAFF',
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  matchTitleWrap: {
    flex: 1,
  },
  matchName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  matchMeta: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 13,
  },
  openButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  locationRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    flex: 1,
    color: '#475569',
    fontSize: 14,
    marginLeft: 6,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  tag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tagText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '500',
  },
  priceText: {
    marginTop: 12,
    color: '#059669',
    fontSize: 14,
    fontWeight: '700',
  },
  reasonsText: {
    marginTop: 8,
    color: '#94A3B8',
    fontSize: 12,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    gap: 10,
  },
  closeBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  closeBtnText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '700',
  },
  shareBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#22C55E',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  addBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#2563EB',
  },
  addBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    backgroundColor: '#94A3B8',
  },
});
