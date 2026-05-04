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
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LOCATIONS, FLOORS, formatUnit } from '../constants/leadOptions';
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

// Extract block name from address with specific masking rules:
// C-1 → C-Block
// C1 → C-Block  
// C-1/3 → C-1 Block
// C-1A → C-Block
const extractBlockName = (address: string): string => {
  if (!address) return '';
  const addr = address.trim();
  
  // Rule 3: If address contains "/" (e.g., "C-1/3" → "C-1 Block")
  if (addr.includes('/')) {
    const parts = addr.split('/');
    const blockPart = parts[0].trim();
    return blockPart ? `${blockPart} Block` : '';
  }
  
  // Rule 4: If address ends with letter after number (e.g., "C-1A" → "C-Block")
  const letterSuffixMatch = addr.match(/^([A-Za-z]+)-?\d+[A-Za-z]+$/);
  if (letterSuffixMatch) {
    return `${letterSuffixMatch[1]}-Block`;
  }
  
  // Rule 1 & 2: C-1 or C1 → C-Block (letter followed by optional dash and number)
  const simpleMatch = addr.match(/^([A-Za-z]+)-?\d+$/);
  if (simpleMatch) {
    return `${simpleMatch[1]}-Block`;
  }
  
  // Fallback: just return first letter part if exists
  const letterMatch = addr.match(/^([A-Za-z]+)/);
  if (letterMatch) {
    return `${letterMatch[1]}-Block`;
  }
  
  return '';
};

// Format location with block name for WhatsApp message (masked for external sharing)
const formatLocationWithBlock = (address: string, location: string): string => {
  const blockName = extractBlockName(address);
  if (blockName && location) {
    return `${blockName}, ${location}`;
  } else if (blockName) {
    return blockName;
  } else if (location) {
    return location;
  }
  return '';
};

// Format location with full address for internal sharing (no masking)
const formatLocationFull = (address: string, location: string): string => {
  if (address && location) {
    return `${address}, ${location}`;
  } else if (address) {
    return address;
  } else if (location) {
    return location;
  }
  return '';
};

// Format date as dd/mm/yy
const formatDate = (dateString: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

// Format floor pricing for display - handles both data structures
const formatFloorPricingInline = (floorPricing: any[], unit: string) => {
  if (!floorPricing || floorPricing.length === 0) return '';
  return floorPricing.map((fp: any) => {
    const floorLabel = fp.floor_label || fp.floor || '';
    const floorAmount = fp.floor_amount || fp.price || fp.amount || '';
    return `${floorLabel}: ₹${floorAmount} ${unit || 'Cr'}`;
  }).join(' | ');
};

// Open WhatsApp - handles case when WhatsApp is not installed
const openWhatsApp = async (phone: string, message?: string) => {
  const cleanPhone = toText(phone).replace(/[^0-9]/g, '');
  const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  
  // Try WhatsApp deep link first
  const whatsappUrl = message 
    ? `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`
    : `https://wa.me/${phoneWithCountry}`;
  
  try {
    const canOpen = await Linking.canOpenURL(whatsappUrl);
    if (canOpen) {
      await Linking.openURL(whatsappUrl);
    } else {
      // Redirect to WhatsApp install page
      const storeUrl = Platform.OS === 'ios' 
        ? 'https://apps.apple.com/app/whatsapp-messenger/id310633997'
        : 'https://play.google.com/store/apps/details?id=com.whatsapp';
      
      Alert.alert(
        'WhatsApp Not Installed',
        'WhatsApp is not installed on your device. Would you like to install it?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Install WhatsApp', onPress: () => Linking.openURL(storeUrl) }
        ]
      );
    }
  } catch (error) {
    // Fallback to store
    const storeUrl = Platform.OS === 'ios' 
      ? 'https://apps.apple.com/app/whatsapp-messenger/id310633997'
      : 'https://play.google.com/store/apps/details?id=com.whatsapp';
    
    Alert.alert(
      'WhatsApp Not Available',
      'Unable to open WhatsApp. Would you like to install it?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Install WhatsApp', onPress: () => Linking.openURL(storeUrl) }
      ]
    );
  }
};

// Make a phone call
const makeCall = (phone: string) => {
  const cleanPhone = toText(phone).replace(/[^0-9]/g, '');
  Linking.openURL(`tel:${cleanPhone}`);
};

// Compose WhatsApp message for single inventory with leadId
const composeInventoryWhatsappMessage = (data: any) => {
  const currentHour = new Date().getHours();
  const greeting = currentHour >= 17 ? 'Good Evening' : (currentHour >= 12 ? 'Good Afternoon' : 'Good Morning');
  
  let msg = `*Hi Sir, ${greeting}*\n\n`;
  msg += 'I\'m sharing a premium residence with you that might be of interest. This home offers good privacy, elegant design, and is in a prime neighbourhood.\n\n';
  
  msg += `*Property 1 - (${data.id}):*\n`;
  
  // Location with block name (e.g., "A Block, Saket")
  const locationWithBlock = formatLocationWithBlock(data.address, data.location);
  msg += `📍 Location: ${locationWithBlock || data.location || ''}\n`;
  
  msg += `📐 Plot Area: ${data.area_size || ''} sq. yds\n`;
  
  if (data.building_facing) { 
    msg += `🧭 Plot Facing: ${data.building_facing}\n`; 
  }
  
  msg += `🏠 Floor: ${data.floor || ''} | BHK: ${data.bhk || ''} | Parking: ${data.car_parking_number || '0'}\n`;
  msg += `📋 Status: ${data.lead_status || ''}\n`;
  
  if (data.possession_on && data.possession_on !== '0000-00-00') { 
    msg += `📅 Possession On: ${formatDate(data.possession_on)}\n`; 
  }
  
  if (data.property_age) { 
    msg += `🏗️ Property Age: ${data.property_age} years\n`; 
  }
  
  if (data.notes) { 
    msg += `✨ Special Features: ${data.notes}\n`; 
  }

  if (data.floor_pricing && data.floor_pricing.length > 0) {
    msg += `💰 Floor-wise Pricing:\n`;
    data.floor_pricing.forEach((fp: any) => {
      const floorLabel = fp.floor_label || fp.floor || '';
      const floorAmount = fp.floor_amount || fp.price || '';
      msg += `   • ${floorLabel}: ₹${floorAmount} ${data.unit || 'CR'}\n`;
    });
    msg += `(All prices are negotiable)\n\n`;
  } else if (data.budget_max) {
    msg += `💰 Asking Price: ${data.budget_max} ${formatUnit(data.unit)} (Negotiable)\n\n`;
  }
  
  msg += '*Would be happy to arrange a site visit at your convenience. Please let me know a suitable day and time.*';
  return msg;
};

// Compose message for multiple inventories with leadId
const composeMultipleInventoriesMessage = (inventories: any[]) => {
  const currentHour = new Date().getHours();
  const greeting = currentHour >= 17 ? 'Good Evening' : (currentHour >= 12 ? 'Good Afternoon' : 'Good Morning');
  
  let msg = `*Hi Sir, ${greeting}*\n\n`;
  msg += `I'm sharing ${inventories.length} premium residences with you that might be of interest.\n\n`;
  
  inventories.forEach((data, index) => {
    msg += `*Property ${index + 1} - (${data.id}):*\n`;
    
    // Location with block name (e.g., "A Block, Saket")
    const locationWithBlock = formatLocationWithBlock(data.address, data.location);
    msg += `📍 Location: ${locationWithBlock || data.location || ''}\n`;
    
    msg += `📐 Plot Area: ${data.area_size || ''} sq. yds\n`;
    msg += `🏠 Floor: ${data.floor || ''} | BHK: ${data.bhk || ''}\n`;
    msg += `📋 Status: ${data.lead_status || ''}\n`;
    
    if (data.floor_pricing && data.floor_pricing.length > 0) {
      msg += `💰 Pricing: `;
      const prices = data.floor_pricing.map((fp: any) => {
        const floorLabel = fp.floor_label || fp.floor || '';
        const floorAmount = fp.floor_amount || fp.price || '';
        return `${floorLabel}: ₹${floorAmount}`;
      }).join(' | ');
      msg += `${prices} ${data.unit || 'CR'}\n`;
    } else if (data.budget_max) {
      msg += `💰 Price: ${data.budget_max} ${formatUnit(data.unit)}\n`;
    }
    msg += `\n`;
  });
  
  msg += '*Would be happy to arrange site visits at your convenience.*';
  return msg;
};

// Compose INTERNAL message for multiple inventories (full address, no masking, no greeting)
const composeInternalInventoriesMessage = (inventories: any[]) => {
  let msg = `*Internal Sharing - ${inventories.length} Properties*\n\n`;
  
  inventories.forEach((data, index) => {
    msg += `*Property ${index + 1} - (${data.id}):*\n`;
    
    // Full address with location (no masking)
    const fullLocation = formatLocationFull(data.address, data.location);
    msg += `📍 Address: ${fullLocation || data.location || ''}\n`;
    
    msg += `📞 Phone: ${data.phone || 'N/A'}\n`;
    msg += `📐 Plot Area: ${data.area_size || ''} sq. yds\n`;
    
    if (data.building_facing) {
      msg += `🧭 Facing: ${data.building_facing}\n`;
    }
    
    msg += `🏠 Floor: ${data.floor || ''} | BHK: ${data.bhk || ''} | Parking: ${data.car_parking_number || '0'}\n`;
    msg += `📋 Status: ${data.lead_status || ''}\n`;
    
    if (data.floor_pricing && data.floor_pricing.length > 0) {
      msg += `💰 Pricing:\n`;
      data.floor_pricing.forEach((fp: any) => {
        const floorLabel = fp.floor_label || fp.floor || '';
        const floorAmount = fp.floor_amount || fp.price || '';
        msg += `   • ${floorLabel}: ₹${floorAmount} ${data.unit || 'CR'}\n`;
      });
    } else if (data.budget_max) {
      msg += `💰 Price: ${data.budget_max} ${formatUnit(data.unit)}\n`;
    }
    
    if (data.notes) {
      msg += `📝 Notes: ${data.notes}\n`;
    }
    
    msg += `\n`;
  });
  
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
  const [internalSharing, setInternalSharing] = useState(false);
  const [locationSearch, setLocationSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [showFloorDropdown, setShowFloorDropdown] = useState(false);

  // Responsive layout for tablets
  const { width: screenWidth } = useWindowDimensions();
  const isTablet = screenWidth >= 768;
  const numColumns = isTablet ? 2 : 1;

  const title = mode === 'inventory' ? 'Matching Inventory' : 'Matching Clients';
  const targetLabel = mode === 'inventory' ? 'inventory' : 'clients';

  const filteredLocations = useMemo(
    () => LOCATIONS.filter((item) => item.toLowerCase().includes(locationSearch.toLowerCase())),
    [locationSearch]
  );

  // Get lead info for display - show ACTUAL lead requirements
  const leadInfo = useMemo(() => {
    if (!lead) return null;
    const budgetMin = Number.parseFloat(toText(lead.budget_min));
    const budgetMax = Number.parseFloat(toText(lead.budget_max));
    const unit = lead.unit || 'CR';
    return {
      location: lead.location || '',
      areaSize: lead.area_size ? `${lead.area_size} sq yds` : '',
      budgetRange: Number.isFinite(budgetMin) && Number.isFinite(budgetMax)
        ? `Min ${budgetMin} | Max ${budgetMax} ${unit}`
        : Number.isFinite(budgetMax) 
          ? `${budgetMax} ${unit}`
          : '',
      floors: lead.floor || '',
      leadType: lead.lead_type || 'Buyer',
      leadId: lead.id,
    };
  }, [lead]);

  // Reset state when modal opens
  useEffect(() => {
    if (visible && lead?.id) {
      const nextFilters = defaultFiltersFromLead(lead);
      setFilters(nextFilters);
      setSelectedIds([]);
      setMatches([]);
      setLocationSearch('');
      setShowFilters(false);
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

  const resetFilters = () => {
    const nextFilters = defaultFiltersFromLead(lead);
    setFilters(nextFilters);
  };

  const applyFilters = () => {
    setShowFilters(false);
    loadMatches(filters);
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

      await openWhatsApp(lead.phone, message);
    } catch (error: any) {
      Alert.alert('Share Failed', error?.message || 'Could not share via WhatsApp.');
    } finally {
      setSharing(false);
    }
  };

  // Internal sharing - full address, no masking, no recipient
  const shareInternal = async () => {
    if (selectedIds.length === 0) {
      Alert.alert('Select Properties', 'Please select at least one property to share.');
      return;
    }

    setInternalSharing(true);
    try {
      const selectedInventories = matches.filter((m) => selectedIds.includes(m.id));
      const message = composeInternalInventoriesMessage(selectedInventories);

      // Open WhatsApp without recipient number - user can forward to anyone
      const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
      
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      if (canOpen) {
        await Linking.openURL(whatsappUrl);
      } else {
        // Fallback to store
        const storeUrl = Platform.OS === 'ios' 
          ? 'https://apps.apple.com/app/whatsapp-messenger/id310633997'
          : 'https://play.google.com/store/apps/details?id=com.whatsapp';
        
        Alert.alert(
          'WhatsApp Not Installed',
          'WhatsApp is not installed on your device. Would you like to install it?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Install WhatsApp', onPress: () => Linking.openURL(storeUrl) }
          ]
        );
      }
    } catch (error: any) {
      Alert.alert('Share Failed', error?.message || 'Could not share via WhatsApp.');
    } finally {
      setInternalSharing(false);
    }
  };

  const renderMatch = ({ item, index, isTablet }: { item: any; index?: number; isTablet?: boolean }) => {
    const checked = selectedIds.includes(item.id);
    
    // Format floor pricing inline - handle the correct data structure
    let floorPricingText = '';
    if (item.floor_pricing && item.floor_pricing.length > 0) {
      floorPricingText = formatFloorPricingInline(item.floor_pricing, item.unit);
    } else if (item.budget_max) {
      floorPricingText = `₹${item.budget_max} ${formatUnit(item.unit)}`;
    } else {
      floorPricingText = 'Price on request';
    }

    const cardStyle = [
      styles.matchCard, 
      checked && styles.matchCardSelected,
      isTablet && styles.matchCardTablet
    ];

    return (
      <TouchableOpacity 
        style={cardStyle} 
        onPress={() => toggleSelected(item.id)}
        activeOpacity={0.7}
      >
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

        {/* Phone with Call and WhatsApp icons */}
        {item.phone && (
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={14} color="#64748B" />
            <Text style={styles.phoneText}>{item.phone}</Text>
            <TouchableOpacity 
              style={styles.phoneAction}
              onPress={(e) => {
                e.stopPropagation();
                makeCall(item.phone);
              }}
            >
              <Ionicons name="call" size={18} color="#2563EB" />
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.phoneAction}
              onPress={(e) => {
                e.stopPropagation();
                openWhatsApp(item.phone);
              }}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={16} color="#64748B" />
          <Text style={styles.locationText} numberOfLines={1}>
            {[item.address, item.location].filter(Boolean).join(', ') || 'No location'}
          </Text>
        </View>

        <View style={styles.tagRow}>
          {item.area_size && (
            <View style={styles.tag}><Text style={styles.tagText}>{item.area_size} sq yds</Text></View>
          )}
          {item.floor && (
            <View style={styles.tag}><Text style={styles.tagText}>{item.floor}</Text></View>
          )}
          {item.bhk && (
            <View style={styles.tag}><Text style={styles.tagText}>{item.bhk}</Text></View>
          )}
          {item.lead_status && (
            <View style={styles.tag}><Text style={styles.tagText}>{item.lead_status}</Text></View>
          )}
        </View>

        <Text style={styles.priceText}>{floorPricingText}</Text>

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
          <View style={styles.headerContent}>
            <Text style={styles.title}>{title} for {toText(lead?.name)}</Text>
            <Text style={styles.subtitle}>{leadInfo?.leadType} Lead ID: {leadInfo?.leadId}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#0F172A" />
          </TouchableOpacity>
        </View>

        {/* Lead Info Pills */}
        {leadInfo && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.infoPillsScroll}>
            <View style={styles.infoPillsContainer}>
              {leadInfo.location && (
                <View style={styles.infoPill}>
                  <Ionicons name="location" size={14} color="#475569" />
                  <Text style={styles.infoPillText}>{leadInfo.location}</Text>
                </View>
              )}
              {leadInfo.areaSize && (
                <View style={styles.infoPill}>
                  <Ionicons name="resize" size={14} color="#475569" />
                  <Text style={styles.infoPillText}>{leadInfo.areaSize}</Text>
                </View>
              )}
              {leadInfo.budgetRange && (
                <View style={styles.infoPill}>
                  <Ionicons name="cash" size={14} color="#475569" />
                  <Text style={styles.infoPillText}>{leadInfo.budgetRange}</Text>
                </View>
              )}
              {leadInfo.floors && (
                <View style={styles.infoPill}>
                  <Ionicons name="layers" size={14} color="#475569" />
                  <Text style={styles.infoPillText}>{leadInfo.floors}</Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* Collapsible Filter Section */}
        <TouchableOpacity 
          style={styles.filterToggle} 
          onPress={() => setShowFilters(!showFilters)}
        >
          <Ionicons name="options-outline" size={20} color="#2563EB" />
          <Text style={styles.filterToggleText}>
            {showFilters ? 'Hide Filters' : 'Modify Filters'}
          </Text>
          <Ionicons name={showFilters ? 'chevron-up' : 'chevron-down'} size={20} color="#2563EB" />
        </TouchableOpacity>

        {showFilters && (
          <View style={styles.filtersContainer}>
            {/* Locations */}
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Locations</Text>
              <TouchableOpacity 
                style={styles.multiSelectBox}
                onPress={() => {
                  setShowLocationDropdown(!showLocationDropdown);
                  setShowFloorDropdown(false);
                }}
              >
                <View style={styles.selectedTagsWrap}>
                  {filters.locations.length > 0 ? (
                    filters.locations.map((loc) => (
                      <View key={loc} style={styles.selectedTag}>
                        <TouchableOpacity onPress={() => removeFilterValue('locations', loc)}>
                          <Text style={styles.selectedTagX}>×</Text>
                        </TouchableOpacity>
                        <Text style={styles.selectedTagText}>{loc}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.placeholderText}>Select locations...</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, locations: [] }))}>
                  <Text style={styles.clearBtn}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {showLocationDropdown && (
              <View style={styles.dropdownOverlay}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search locations..."
                  placeholderTextColor="#94A3B8"
                  value={locationSearch}
                  onChangeText={setLocationSearch}
                />
                <ScrollView style={styles.dropdownList} nestedScrollEnabled>
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

            {/* Area and Budget Row */}
            <View style={styles.filterGridRow}>
              <View style={styles.filterGridItem}>
                <Text style={styles.filterLabel}>Area Min</Text>
                <TextInput
                  style={styles.filterInput}
                  keyboardType="numeric"
                  value={filters.area_min}
                  onChangeText={(text) => updateTextFilter('area_min', text)}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={styles.filterGridItem}>
                <Text style={styles.filterLabel}>Area Max</Text>
                <TextInput
                  style={styles.filterInput}
                  keyboardType="numeric"
                  value={filters.area_max}
                  onChangeText={(text) => updateTextFilter('area_max', text)}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={styles.filterGridItem}>
                <Text style={styles.filterLabel}>Budget Min</Text>
                <TextInput
                  style={styles.filterInput}
                  keyboardType="numeric"
                  value={filters.budget_min}
                  onChangeText={(text) => updateTextFilter('budget_min', text)}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={styles.filterGridItem}>
                <Text style={styles.filterLabel}>Budget Max</Text>
                <TextInput
                  style={styles.filterInput}
                  keyboardType="numeric"
                  value={filters.budget_max}
                  onChangeText={(text) => updateTextFilter('budget_max', text)}
                  placeholder="0"
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            {/* Preferred Floor */}
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Preferred Floor</Text>
              <TouchableOpacity 
                style={styles.multiSelectBox}
                onPress={() => {
                  setShowFloorDropdown(!showFloorDropdown);
                  setShowLocationDropdown(false);
                }}
              >
                <View style={styles.selectedTagsWrap}>
                  {filters.floors.length > 0 ? (
                    filters.floors.map((fl) => (
                      <View key={fl} style={styles.selectedTag}>
                        <TouchableOpacity onPress={() => removeFilterValue('floors', fl)}>
                          <Text style={styles.selectedTagX}>×</Text>
                        </TouchableOpacity>
                        <Text style={styles.selectedTagText}>{fl}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.placeholderText}>Select floors...</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setFilters(prev => ({ ...prev, floors: [] }))}>
                  <Text style={styles.clearBtn}>×</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </View>

            {showFloorDropdown && (
              <View style={styles.dropdownOverlay}>
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

            {/* Filter Actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
                <Text style={styles.resetBtnText}>Reset to {leadInfo?.leadType || 'Lead'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyBtn} onPress={applyFilters}>
                <Text style={styles.applyBtnText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
            renderItem={({ item, index }) => renderMatch({ item, index, isTablet })}
            numColumns={numColumns}
            key={numColumns}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
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
          
          {/* Internal Sharing - Full address, no recipient */}
          <TouchableOpacity 
            style={[styles.internalShareBtn, (internalSharing || selectedIds.length === 0) && styles.btnDisabled]} 
            onPress={shareInternal} 
            disabled={internalSharing || selectedIds.length === 0}
          >
            {internalSharing ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="share-outline" size={18} color="#FFFFFF" />
            )}
            <Text style={styles.internalShareBtnText}>Internal</Text>
          </TouchableOpacity>
          
          {/* External Share to Lead */}
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

// Export helper functions for use in other components
export { openWhatsApp, makeCall, composeInventoryWhatsappMessage, composeMultipleInventoriesMessage, formatLocationWithBlock };

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerContent: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    fontStyle: 'italic',
  },
  subtitle: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 13,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lead Info Pills
  infoPillsScroll: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
  },
  infoPillsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  infoPillText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '500',
  },
  // Filter Toggle
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 12,
    gap: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#DBEAFE',
  },
  filterToggleText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '600',
  },
  // Filters Container
  filtersContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterRow: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 6,
  },
  multiSelectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
    backgroundColor: '#FFFFFF',
  },
  selectedTagsWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingLeft: 6,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  selectedTagX: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
  },
  selectedTagText: {
    color: '#334155',
    fontSize: 13,
  },
  placeholderText: {
    color: '#94A3B8',
    fontSize: 14,
  },
  clearBtn: {
    color: '#94A3B8',
    fontSize: 20,
    paddingLeft: 8,
  },
  dropdownOverlay: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 12,
    maxHeight: 180,
  },
  searchInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    fontSize: 14,
    color: '#0F172A',
  },
  dropdownList: {
    maxHeight: 130,
  },
  dropdownListSmall: {
    maxHeight: 150,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#334155',
    marginLeft: 10,
  },
  checkboxSmall: {
    width: 18,
    height: 18,
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
  filterGridRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  filterGridItem: {
    flex: 1,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  resetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtnText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  // Results
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
  columnWrapper: {
    justifyContent: 'space-between',
    gap: 12,
  },
  emptyText: {
    paddingVertical: 40,
    textAlign: 'center',
    color: '#64748B',
    fontSize: 15,
  },
  // Match Card
  matchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    flex: 1,
  },
  matchCardTablet: {
    flex: 0.48,
    maxWidth: '49%',
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
  // Phone Row with Call and WhatsApp
  phoneRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneText: {
    flex: 1,
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '500',
  },
  phoneAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  locationRow: {
    marginTop: 10,
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
  // Footer
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
  internalShareBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#6366F1',
  },
  internalShareBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
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
