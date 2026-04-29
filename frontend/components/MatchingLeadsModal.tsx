import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LOCATIONS, FLOORS, formatFloorPricing, formatUnit } from '../constants/leadOptions';
import { offlineApi } from '../services/offlineApi';
import { buildInventoryDetailsMessage, buildSelectedInventoryMessage, openWhatsapp } from '../utils/whatsappMessages';

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
  const [locationSearch, setLocationSearch] = useState('');
  const [floorSearch, setFloorSearch] = useState('');

  const title = mode === 'inventory' ? 'Matching Inventories' : 'Matching Clients';
  const targetLabel = mode === 'inventory' ? 'inventory' : 'clients';
  const selectedRows = useMemo(
    () => matches.filter((item) => selectedIds.includes(item.id)),
    [matches, selectedIds]
  );

  const filteredLocations = useMemo(
    () => LOCATIONS.filter((item) => item.toLowerCase().includes(locationSearch.toLowerCase())),
    [locationSearch]
  );

  const filteredFloors = useMemo(
    () => FLOORS.filter((item) => item.toLowerCase().includes(floorSearch.toLowerCase())),
    [floorSearch]
  );

  useEffect(() => {
    if (visible && lead?.id) {
      const nextFilters = defaultFiltersFromLead(lead);
      setFilters(nextFilters);
      setSelectedIds([]);
      loadMatches(nextFilters);
    }
  }, [visible, lead?.id]);

  const loadMatches = async (activeFilters = filters) => {
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
      Alert.alert('Matching Unavailable', error?.message || `Failed to fetch matching ${targetLabel}.`);
    } finally {
      setLoading(false);
    }
  };

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

  const sendSelectedWhatsapp = async () => {
    if (selectedRows.length === 0) {
      Alert.alert('Select Matches', `Select at least one ${targetLabel.slice(0, -1)}.`);
      return;
    }

    if (mode === 'inventory') {
      await openWhatsapp(lead?.phone, buildSelectedInventoryMessage(selectedRows));
      return;
    }

    if (selectedRows.length > 1) {
      Alert.alert('Select One Client', 'Please select one client at a time before sending WhatsApp.');
      return;
    }

    await openWhatsapp(selectedRows[0]?.phone, buildInventoryDetailsMessage(lead));
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
          {[item.area_size ? `${item.area_size} sq yds` : null, item.floor, item.bhk, item.lead_status].filter(Boolean).map((tag) => (
            <View key={String(tag)} style={styles.tag}>
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

        <ScrollView style={styles.filters} keyboardShouldPersistTaps="handled">
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

          <Text style={styles.label}>Locations</Text>
          <TextInput style={styles.input} placeholder="Search locations" value={locationSearch} onChangeText={setLocationSearch} />
          <View style={styles.chipWrap}>
            {filteredLocations.slice(0, 18).map((item) => (
              <TouchableOpacity key={item} style={[styles.chip, filters.locations.includes(item) && styles.chipSelected]} onPress={() => toggleFilterValue('locations', item)}>
                <Text style={[styles.chipText, filters.locations.includes(item) && styles.chipTextSelected]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Floors</Text>
          <TextInput style={styles.input} placeholder="Search floors" value={floorSearch} onChangeText={setFloorSearch} />
          <View style={styles.chipWrap}>
            {filteredFloors.map((item) => (
              <TouchableOpacity key={item} style={[styles.chip, filters.floors.includes(item) && styles.chipSelected]} onPress={() => toggleFilterValue('floors', item)}>
                <Text style={[styles.chipText, filters.floors.includes(item) && styles.chipTextSelected]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>

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
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.whatsappButton, selectedIds.length === 0 && styles.saveButtonDisabled]} onPress={sendSelectedWhatsapp} disabled={selectedIds.length === 0}>
            <Ionicons name="logo-whatsapp" size={18} color="#FFFFFF" />
            <Text style={styles.saveButtonText}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveButton, (saving || selectedIds.length === 0) && styles.saveButtonDisabled]} onPress={saveSelected} disabled={saving || selectedIds.length === 0}>
            {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="star" size={18} color="#FFFFFF" />}
            <Text style={styles.saveButtonText}>Add Checked</Text>
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
    maxHeight: 330,
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  chipSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  chipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: '#1D4ED8',
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
    gap: 10,
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
  saveButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#2563EB',
  },
  whatsappButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#16A34A',
  },
  saveButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
