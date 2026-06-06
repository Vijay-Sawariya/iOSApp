import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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

const openWhatsApp = (phone?: string, name?: string) => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(`Hi ${name || ''}, `)}`);
};

export default function EnquiriesScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>({});
  const [historicalTotal, setHistoricalTotal] = useState<number | null>(null);
  const [category, setCategory] = useState<'all' | 'kothi' | 'floor'>('all');
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async (force = false) => {
    try {
      const response = await api.getLegacyInventory(category, submittedSearch, force ? { forceRefresh: true } : undefined);
      setItems(Array.isArray(response?.items) ? response.items : []);
      setCounts(response?.counts || { all: response?.total || 0 });
      setHistoricalTotal(typeof response?.historical_total === 'number' ? response.historical_total : null);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load legacy inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [category, submittedSearch]);

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
    setSubmittedSearch(search.trim());
  };

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

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.inkMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone, location"
            placeholderTextColor={colors.inkSubtle}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            onSubmitEditing={applySearch}
          />
          <TouchableOpacity style={styles.searchButton} onPress={applySearch}>
            <Text style={styles.searchButtonText}>Search</Text>
          </TouchableOpacity>
        </View>

        {submittedSearch ? (
          <View style={styles.searchResultBar}>
            <Text style={styles.searchResultText} numberOfLines={1}>Search: {submittedSearch}</Text>
            <TouchableOpacity onPress={() => { setSearch(''); setSubmittedSearch(''); }}>
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
            <LegacyInventoryCard key={`${item.legacy_source || 'legacy'}-${item.id}`} item={item} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function LegacyInventoryCard({ item }: { item: any }) {
  const canViewSensitive = item.can_view_sensitive !== false;
  const hasCallablePhone = canViewSensitive && !!item.phone;
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
        <TouchableOpacity
          style={styles.convertButton}
          onPress={() => router.push(`/leads/add?type=inventory&name=${encodeURIComponent(item.name || '')}&phone=${encodeURIComponent(canViewSensitive ? item.phone || '' : '')}` as any)}
        >
          <Ionicons name="add-circle-outline" size={16} color={colors.white} />
          <Text style={styles.convertButtonText}>Add Inventory</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  searchBox: {
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, paddingVertical: 8 },
  searchButton: {
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
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
});
