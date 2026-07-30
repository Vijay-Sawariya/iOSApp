import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../services/api';
import { colors, radii, shadows } from '../constants/theme';

const callPhone = (phone?: string) => {
  if (phone) Linking.openURL(`tel:${phone}`);
};

const openWhatsApp = async (phone?: string, name?: string) => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  const message = `Hi ${name || ''}, `;
  await api.sendWhatsApp({
    phone,
    message,
    status: 'opened',
    source: 'ios_legacy_inventory',
  }).catch((error) => console.warn('WhatsApp log failed:', error));
  Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`);
};

type LegacySearchCriteria = {
  name: string;
  location: string;
  address: string;
  phone: string;
  status: string;
  messageStatus: 'all' | 'not_sent' | 'sent';
};

const EMPTY_SEARCH: LegacySearchCriteria = {
  name: '',
  location: '',
  address: '',
  phone: '',
  status: '',
  messageStatus: 'all',
};

export default function EnquiriesScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [historicalTotal, setHistoricalTotal] = useState<number | null>(null);
  const [category, setCategory] = useState<'all' | 'kothi' | 'floor'>('all');
  const [showSearchCriteria, setShowSearchCriteria] = useState(false);
  const [searchCriteria, setSearchCriteria] = useState<LegacySearchCriteria>(EMPTY_SEARCH);
  const [submittedCriteria, setSubmittedCriteria] = useState<LegacySearchCriteria>(EMPTY_SEARCH);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (force = false) => {
    try {
      const response: any = await api.getLegacyInventory(category, submittedCriteria, force ? { forceNetwork: true } : undefined);
      setItems(Array.isArray(response?.items) ? response.items : []);
      setCounts(response?.counts || { all: response?.total || 0 });
      setHistoricalTotal(typeof response?.historical_total === 'number' ? response.historical_total : null);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load legacy inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, submittedCriteria]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading legacy inventory...</Text>
      </SafeAreaView>
    );
  }

  const applySearch = () => {
    setSubmittedCriteria({
      name: searchCriteria.name.trim(),
      location: searchCriteria.location.trim(),
      address: searchCriteria.address.trim(),
      phone: searchCriteria.phone.trim(),
      status: searchCriteria.status.trim(),
      messageStatus: searchCriteria.messageStatus,
    });
  };

  const clearSearch = () => {
    setSearchCriteria(EMPTY_SEARCH);
    setSubmittedCriteria(EMPTY_SEARCH);
  };

  const hasSubmittedCriteria = Object.entries(submittedCriteria).some(
    ([key, value]) => Boolean(value) && !(key === 'messageStatus' && value === 'all')
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Legacy Inventory</Text>
          <Text style={styles.subtitle}>{historicalTotal || counts?.all || items.length} historical Kothi and Floor records</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.filterRow}>
          <FilterChip label="All" count={counts?.all} active={category === 'all'} onPress={() => setCategory('all')} />
          <FilterChip label="Kothi" count={counts?.kothi} active={category === 'kothi'} onPress={() => setCategory('kothi')} />
          <FilterChip label="Floor" count={counts?.floor} active={category === 'floor'} onPress={() => setCategory('floor')} />
        </View>

        <TouchableOpacity
          style={[styles.searchToggle, hasSubmittedCriteria && styles.searchToggleActive]}
          onPress={() => setShowSearchCriteria((visible) => !visible)}
        >
          <View style={styles.searchToggleCopy}>
            <Ionicons name="options-outline" size={19} color={hasSubmittedCriteria ? colors.primary : colors.ink} />
            <Text style={[styles.searchToggleText, hasSubmittedCriteria && styles.searchToggleTextActive]}>
              Search Criteria
            </Text>
          </View>
          <Ionicons
            name={showSearchCriteria ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.inkMuted}
          />
        </TouchableOpacity>

        {showSearchCriteria ? (
          <View style={styles.searchCriteriaCard}>
            <SearchField
              label="Name"
              icon="person-outline"
              value={searchCriteria.name}
              onChangeText={(name) => setSearchCriteria((current) => ({ ...current, name }))}
              onSubmitEditing={applySearch}
            />
            <SearchField
              label="Location"
              icon="location-outline"
              value={searchCriteria.location}
              onChangeText={(location) => setSearchCriteria((current) => ({ ...current, location }))}
              onSubmitEditing={applySearch}
            />
            <SearchField
              label="Address"
              icon="home-outline"
              value={searchCriteria.address}
              onChangeText={(address) => setSearchCriteria((current) => ({ ...current, address }))}
              onSubmitEditing={applySearch}
            />
            <SearchField
              label="Phone"
              icon="call-outline"
              value={searchCriteria.phone}
              onChangeText={(phone) => setSearchCriteria((current) => ({ ...current, phone }))}
              onSubmitEditing={applySearch}
              keyboardType="phone-pad"
            />
            <SearchField
              label="Status"
              icon="flag-outline"
              value={searchCriteria.status}
              onChangeText={(status) => setSearchCriteria((current) => ({ ...current, status }))}
              onSubmitEditing={applySearch}
            />
            <View style={styles.searchField}>
              <Text style={styles.searchFieldLabel}>Messaged Not Sent</Text>
              <View style={styles.messageStatusRow}>
                {([
                  ['all', 'All Leads'],
                  ['not_sent', 'Not Sent'],
                  ['sent', 'Sent'],
                ] as const).map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.messageStatusChip,
                      searchCriteria.messageStatus === value && styles.messageStatusChipActive,
                    ]}
                    onPress={() => setSearchCriteria((current) => ({ ...current, messageStatus: value }))}
                  >
                    <Text
                      style={[
                        styles.messageStatusText,
                        searchCriteria.messageStatus === value && styles.messageStatusTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.searchActions}>
              <TouchableOpacity style={styles.clearButton} onPress={clearSearch}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.searchButton} onPress={applySearch}>
                <Ionicons name="search" size={16} color={colors.white} />
                <Text style={styles.searchButtonText}>Search</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {hasSubmittedCriteria ? (
          <View style={styles.searchResultBar}>
            <Text style={styles.searchResultText} numberOfLines={1}>
              {Object.entries(submittedCriteria)
                .filter(([key, value]) => value && !(key === 'messageStatus' && value === 'all'))
                .map(([key, value]) => `${key === 'messageStatus' ? 'message' : key}: ${String(value).replace('_', ' ')}`)
                .join(' · ')}
            </Text>
            <TouchableOpacity onPress={clearSearch}>
              <Ionicons name="close-circle" size={20} color={colors.inkMuted} />
            </TouchableOpacity>
          </View>
        ) : null}

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="archive-outline" size={28} color={colors.inkSubtle} />
            <Text style={styles.emptyTitle}>No legacy inventory</Text>
            <Text style={styles.emptyText}>Kothi and floor legacy records from the old enquiry table will appear here.</Text>
          </View>
        ) : (
          items.map((item) => (
            <LegacyInventoryCard
              key={`${item.legacy_source || 'legacy'}-${item.id}`}
              item={item}
              onStatusChanged={(status) => {
                setItems((current) => current.map((row) =>
                  row.id === item.id && row.legacy_source === item.legacy_source
                    ? { ...row, status }
                    : row
                ));
              }}
              onDeleted={() => {
                setItems((current) => current.filter((row) =>
                  !(row.id === item.id && row.legacy_source === item.legacy_source)
                ));
              }}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SearchField({
  label,
  icon,
  value,
  onChangeText,
  onSubmitEditing,
  keyboardType = 'default',
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  onSubmitEditing: () => void;
  keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <View style={styles.searchField}>
      <Text style={styles.searchFieldLabel}>{label}</Text>
      <View style={styles.searchInputWrap}>
        <Ionicons name={icon} size={17} color={colors.inkMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={`Search by ${label.toLowerCase()}`}
          placeholderTextColor={colors.inkSubtle}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          returnKeyType="search"
          keyboardType={keyboardType}
        />
      </View>
    </View>
  );
}

const LEGACY_ACTIONS: Array<{
  label: string;
  status: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = [
  { label: 'Mark Potential / Set Follow-up', status: 'Potential', icon: 'star', color: '#EAB308' },
  { label: 'Contacted', status: 'Contacted', icon: 'headset', color: '#2563EB' },
  { label: 'Pending', status: 'Pending', icon: 'time-outline', color: '#D97706' },
  { label: 'Not Interested', status: 'Not Interested', icon: 'ban-outline', color: '#64748B' },
  { label: 'Invalid Number', status: 'Invalid Number', icon: 'close-circle', color: '#DC2626' },
  { label: 'Sold', status: 'Sold', icon: 'hand-left-outline', color: '#059669' },
  { label: 'Not Picking Call', status: 'Not Picking Call', icon: 'call-outline', color: '#D97706' },
];

function LegacyInventoryCard({
  item,
  onStatusChanged,
  onDeleted,
}: {
  item: any;
  onStatusChanged: (status: string) => void;
  onDeleted: () => void;
}) {
  const canViewSensitive = item.can_view_sensitive !== false;
  const hasCallablePhone = canViewSensitive && !!item.phone;
  const [showActions, setShowActions] = useState(false);
  const [updating, setUpdating] = useState(false);

  const updateStatus = (status: string) => {
    setShowActions(false);
    Alert.alert(
      'Update legacy status',
      `Change ${item.name || 'this record'} to ${status}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Update',
          onPress: async () => {
            setUpdating(true);
            try {
              await api.updateLegacyInventoryStatus(item.legacy_source, Number(item.id), status);
              onStatusChanged(status);
            } catch (error: any) {
              Alert.alert('Unable to update', error?.message || 'Please try again.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  const openConvertForm = () => {
    setShowActions(false);
    router.push({
      pathname: '/leads/add',
      params: {
        type: 'inventory',
        legacyId: String(item.id),
        legacySource: item.legacy_source || 'enquiries',
        name: item.name || '',
        phone: canViewSensitive ? item.phone || '' : '',
        location: item.location || '',
        address: canViewSensitive ? item.address || '' : '',
        propertyType: item.property_type || item.flat_type || '',
        bhk: item.bhk || '',
        floor: item.floor || '',
        areaSize: item.area_size || '',
        budgetMin: item.budget_min || '',
        budgetMax: item.budget_max || '',
        unit: item.unit || 'CR',
        notes: item.notes || '',
      },
    } as any);
  };

  const deleteRecord = () => {
    setShowActions(false);
    Alert.alert(
      'Delete legacy record',
      'This record will be removed from Legacy Inventory.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setUpdating(true);
            try {
              await api.deleteLegacyInventory(item.legacy_source, Number(item.id));
              onDeleted();
            } catch (error: any) {
              Alert.alert('Unable to delete', error?.message || 'Please try again.');
            } finally {
              setUpdating(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{item.name || 'Legacy inventory'}</Text>
          <Text style={styles.cardMeta}>{item.location || 'Location n/a'} · {item.property_type || item.bhk || 'Type n/a'}</Text>
        </View>
        <View style={[styles.badge, item.legacy_category === 'floor' && styles.floorBadge]}>
          <Text style={[styles.badgeText, item.legacy_category === 'floor' && styles.floorBadgeText]}>
            {item.legacy_category === 'floor' ? 'Floor' : 'Kothi'}
          </Text>
        </View>
      </View>
      {item.phone ? <Text style={styles.phoneText}>{item.phone}</Text> : null}
      {item.address ? <Text style={styles.addressText} numberOfLines={1}>{item.address}</Text> : null}
      <Text style={styles.notes} numberOfLines={3}>{item.notes || 'No message captured yet'}</Text>
      <View style={styles.metaGrid}>
        <Text style={styles.metaPill}>{item.status || 'Pending'}</Text>
        {item.budget_max || item.budget_min ? <Text style={styles.metaPill}>₹{item.budget_max || item.budget_min} {item.unit || 'Cr'}</Text> : null}
        {item.floor ? <Text style={styles.metaPill}>{item.floor}</Text> : null}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.iconAction, !hasCallablePhone && styles.disabledAction]} onPress={() => callPhone(item.phone)} disabled={!hasCallablePhone}>
          <Ionicons name="call" size={17} color={hasCallablePhone ? colors.accent : colors.inkSubtle} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconAction, !hasCallablePhone && styles.disabledAction]} onPress={() => openWhatsApp(item.phone, item.name)} disabled={!hasCallablePhone}>
          <Ionicons name="logo-whatsapp" size={17} color={hasCallablePhone ? '#25D366' : colors.inkSubtle} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.convertButton} onPress={() => setShowActions(true)} disabled={updating}>
          {updating ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="ellipsis-horizontal" size={17} color={colors.white} />
          )}
          <Text style={styles.convertButtonText}>Action</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showActions} transparent animationType="fade" onRequestClose={() => setShowActions(false)}>
        <Pressable style={styles.actionOverlay} onPress={() => setShowActions(false)}>
          <Pressable style={styles.actionSheet} onPress={(event) => event.stopPropagation()}>
            <View style={styles.actionSheetHandle} />
            <Text style={styles.actionSheetTitle}>Legacy Lead Actions</Text>
            <Text style={styles.actionSheetSubtitle} numberOfLines={1}>{item.name || 'Legacy inventory'}</Text>
            {LEGACY_ACTIONS.slice(0, 3).map((action) => (
              <ActionMenuRow key={action.status} {...action} onPress={() => updateStatus(action.status)} />
            ))}
            <ActionMenuRow label="Convert" icon="checkmark-circle" color="#059669" onPress={openConvertForm} />
            {LEGACY_ACTIONS.slice(3).map((action) => (
              <ActionMenuRow key={action.status} {...action} onPress={() => updateStatus(action.status)} />
            ))}
            <View style={styles.actionDivider} />
            <ActionMenuRow label="Delete record" icon="trash-outline" color="#DC2626" onPress={deleteRecord} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ActionMenuRow({
  label,
  icon,
  color,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionMenuRow} onPress={onPress}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.actionMenuLabel, label === 'Delete record' && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function FilterChip({ label, count, active, onPress }: { label: string; count?: number | null; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
      {typeof count === 'number' ? <Text style={[styles.filterChipCount, active && styles.filterChipTextActive]}>{count}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  muted: { marginTop: 10, color: colors.inkMuted },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  headerCopy: { flex: 1, marginHorizontal: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  content: { padding: 16, paddingBottom: 32 },
  empty: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    padding: 22,
    alignItems: 'center',
    ...shadows.card,
  },
  emptyTitle: { marginTop: 8, fontSize: 16, fontWeight: '800', color: colors.ink },
  emptyText: { marginTop: 5, fontSize: 13, color: colors.inkMuted, textAlign: 'center', lineHeight: 19 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: {
    flex: 1,
    minHeight: 42,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '800', color: colors.ink },
  filterChipTextActive: { color: colors.white },
  filterChipCount: { fontSize: 11, color: colors.inkMuted, marginTop: 1 },
  searchToggle: {
    minHeight: 46,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  searchToggleActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  searchToggleCopy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchToggleText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  searchToggleTextActive: { color: colors.primary },
  searchCriteriaCard: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginTop: -4,
    marginBottom: 12,
    gap: 10,
  },
  searchField: { gap: 5 },
  searchFieldLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  searchInputWrap: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 8 },
  messageStatusRow: { flexDirection: 'row', gap: 7 },
  messageStatusChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  messageStatusChipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  messageStatusText: { color: colors.inkMuted, fontSize: 11, fontWeight: '800' },
  messageStatusTextActive: { color: colors.primary },
  searchActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 2 },
  clearButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' },
  searchButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 9,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  searchButtonText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  searchResultBar: {
    minHeight: 36,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  searchResultText: { flex: 1, color: colors.primary, fontSize: 12, fontWeight: '800' },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  badge: { backgroundColor: colors.accentSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.pill },
  badgeText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  floorBadge: { backgroundColor: colors.primarySoft },
  floorBadgeText: { color: colors.primary },
  phoneText: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 10 },
  addressText: { fontSize: 12, color: colors.inkMuted, marginTop: 4 },
  notes: { fontSize: 13, color: colors.inkMuted, marginTop: 10, lineHeight: 19 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  metaPill: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.inkMuted,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  disabledAction: { opacity: 0.55 },
  convertButton: {
    marginLeft: 'auto',
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  convertButtonText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  actionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  actionSheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
  },
  actionSheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: 14,
  },
  actionSheetTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  actionSheetSubtitle: { color: colors.inkMuted, fontSize: 12, marginTop: 3, marginBottom: 10 },
  actionMenuRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 4,
  },
  actionMenuLabel: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' },
  actionDivider: { height: 1, backgroundColor: colors.border, marginVertical: 5 },
});
