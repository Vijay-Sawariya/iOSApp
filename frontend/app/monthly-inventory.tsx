import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import { api, getAuthToken } from '../services/api';
import { API_URL } from '../constants/config';
import { useAuth } from '../contexts/AuthContext';
import { colors, radii } from '../constants/theme';
import { SearchableMultiSelect } from '../components/forms/SearchableMultiSelect';
import { CustomDropdown } from '../components/forms/CustomDropdown';
import { MonthlyEntry, conversionParams } from '../services/monthlyInventory';

// Session-only state: keep criteria and loaded pages when this route is reopened.
// The auth token scopes the snapshot so another login cannot reuse it.
let bookSessionToken: string | null | undefined;
let bookSession: Record<string, any> = {};
function useBookState<T,>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => key in bookSession ? bookSession[key] : initial);
  useEffect(() => { bookSession[key] = value; }, [key, value]);
  return [value, setValue] as const;
}

const categories: Record<string, string> = {
  'All categories': '', 'Residential sale': 'residential_sale', 'Residential rent': 'residential_rent',
  'Commercial sale': 'commercial_sale', 'Commercial rent': 'commercial_rent',
};

function BookCard({ item, onPdf, onDelete, deleting, onStatusSaved }: { onStatusSaved: (id: number, status: MonthlyEntry['inventory_status']) => void; item: MonthlyEntry; onPdf: (id: number) => void; onDelete: (id: number) => void; deleting: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<string>(item.inventory_status || 'Available');
  const [draftStatus, setDraftStatus] = useState(status);
  const [statusModal, setStatusModal] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  useEffect(() => { setStatus(item.inventory_status || 'Available'); }, [item.inventory_status]);
  const leadId = item.converted_lead_id || item.matching_lead_id;
  return <View style={[styles.card, status !== 'Available' && { borderLeftWidth: 5, borderLeftColor: status === 'Hold' ? '#b7791f' : status === 'Sold' ? '#b42318' : '#64748b', backgroundColor: status === 'Hold' ? '#fffbeb' : status === 'Sold' ? '#fff5f5' : '#f1f5f9' }]}>
    {status !== 'Available' && <Text style={{ color: '#9a3412', fontWeight: '700' }}>{status} · Avoid availability calls</Text>}
    <Text style={styles.cardTitle}>{item.owner_name || 'Inventory entry'}</Text>
    {!!item.phone && <Text style={styles.phone}>{item.phone}</Text>}
    <Text style={styles.address}>{[item.address, item.location].filter(Boolean).join(', ')}</Text>
    <Text style={styles.muted}>{item.book_month.slice(0, 7)} · {item.category.replace('_', ' ')}</Text>
    <View style={styles.tags}>
      {[item.area_size ? `${item.area_size} ${item.area_unit}` : '', item.floor, item.configuration, item.entry_status,
        item.converted_lead_id ? 'Converted' : '', item.needs_review ? 'Review details' : ''].filter(Boolean).map((tag, i) =>
        <Text key={i} style={styles.tag}>{tag}</Text>)}
    </View>
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.noteButton}>
      <Text style={styles.muted}>{expanded ? '▾' : '▸'} Original book note</Text>
    </TouchableOpacity>
    {expanded && <Text style={styles.note}>{item.note}</Text>}
    <Modal visible={statusModal} transparent animationType="fade" onRequestClose={() => !savingStatus && setStatusModal(false)}>
      <View style={{ flex: 1, backgroundColor: '#0007', justifyContent: 'center', padding: 24 }}><View style={[styles.card, { gap: 16 }]}>
        <Text style={styles.cardTitle}>Update Inventory Status</Text><Text style={styles.muted}>{item.owner_name}</Text>
        <CustomDropdown label="Property Status" value={draftStatus} options={['Available', 'Sold', 'Hold', 'Invalid']} onSelect={setDraftStatus} />
        <View style={styles.actions}><TouchableOpacity disabled={savingStatus} style={styles.action} onPress={() => setStatusModal(false)}><Text>Cancel</Text></TouchableOpacity>
        <TouchableOpacity disabled={savingStatus} style={[styles.action, styles.primary]} onPress={async () => {
          setSavingStatus(true);
          try { await api.updateMonthlyInventoryStatus(item.id, draftStatus); setStatus(draftStatus); onStatusSaved(item.id, draftStatus as MonthlyEntry['inventory_status']); setStatusModal(false); }
          catch (e: any) { Alert.alert('Unable to save', e.message); }
          finally { setSavingStatus(false); }
        }}><Text style={{ color: colors.white }}>{savingStatus ? 'Saving…' : 'Update Status'}</Text></TouchableOpacity></View>
      </View></View>
    </Modal>
    <View style={styles.actions}>
      <TouchableOpacity style={styles.action} onPress={() => { setDraftStatus(status); setStatusModal(true); }} accessibilityLabel="Update inventory status"><Ionicons name="swap-horizontal" size={15} color={colors.primary} /><Text style={styles.actionText}>Status</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.pdf_id ? 'View book PDF' : 'Book PDF not uploaded'} disabled={!item.pdf_id}
        style={[styles.action, !item.pdf_id && styles.disabled]} onPress={() => item.pdf_id && onPdf(item.pdf_id)}>
        <Ionicons name="document-text-outline" size={15} color={colors.primary} /><Text style={styles.actionText}>{item.pdf_id ? 'View PDF' : 'No PDF'}</Text>
      </TouchableOpacity>
      {!!leadId && <TouchableOpacity accessibilityRole="button" style={styles.action} onPress={() => router.push(`/leads/${leadId}` as any)}>
        <Ionicons name="open-outline" size={15} color={colors.primary} /><Text style={styles.actionText}>View Lead</Text>
      </TouchableOpacity>}
      {!leadId && <TouchableOpacity accessibilityRole="button" style={[styles.action, styles.primary]} onPress={() => router.push({ pathname: '/leads/add', params: conversionParams(item) } as any)}>
        <Ionicons name="swap-horizontal" size={15} color={colors.white} /><Text style={[styles.actionText, { color: colors.white }]}>Convert</Text>
      </TouchableOpacity>}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Soft delete inventory" disabled={deleting} style={styles.action} onPress={() => onDelete(item.id)}>
        {deleting ? <ActivityIndicator size="small" color={colors.danger} /> : <><Ionicons name="trash-outline" size={15} color={colors.danger} /><Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text></>}
      </TouchableOpacity>
    </View>
  </View>;
}

export default function MonthlyInventoryScreen() {
  const { user } = useAuth();
  const allowed = user?.username === 'vsawariya';
  const token = getAuthToken();
  if (bookSessionToken !== token) { bookSessionToken = token; bookSession = {}; }
  const [items, setItems] = useBookState<MonthlyEntry[]>('items', []);
  const [locationOptions, setLocationOptions] = useBookState<string[]>('locationOptions', []);
  const [selectedLocations, setSelectedLocations] = useBookState<string[]>('selectedLocations', []);
  const [appliedLocations, setAppliedLocations] = useBookState<string[]>('appliedLocations', []);
  const [months, setMonths] = useBookState<string[]>('months', []);
  const [month, setMonth] = useBookState('month', 'All months');
  const [category, setCategory] = useBookState('category', 'All categories');
  const [criteriaExpanded, setCriteriaExpanded] = useBookState('criteriaExpanded', false);
  const [searchInput, setSearchInput] = useBookState('searchInput', '');
  const [search, setSearch] = useBookState('search', '');
  const emptyCriteria = { address: '', owner_name: '', phone: '', floor: '', min_area: '', max_area: '' };
  const [criteria, setCriteria] = useBookState('criteria', emptyCriteria);
  const [appliedCriteria, setAppliedCriteria] = useBookState('appliedCriteria', emptyCriteria);
  const applySearch = () => {
    const minimum = criteria.min_area.trim(), maximum = criteria.max_area.trim();
    if ([minimum, maximum].some(value => value && (!Number.isFinite(Number(value)) || Number(value) < 0)) ||
        (minimum && maximum && Number(minimum) > Number(maximum))) {
      Alert.alert('Invalid area range', 'Enter non-negative areas with minimum area no greater than maximum area.');
      return;
    }
    setAppliedLocations(selectedLocations);
    setSearch(searchInput.trim());
    setAppliedCriteria(Object.fromEntries(Object.entries(criteria).map(([key, value]) => [key, value.trim()])) as typeof criteria);
  };
  const [page, setPage] = useBookState('page', 1);
  const [total, setTotal] = useBookState('total', 0);
  const [hasMore, setHasMore] = useBookState('hasMore', false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pdfId, setPdfId] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const requestVersion = useRef(0);
  const loadedQuery = useRef<string | null>(bookSession.loadedQuery ?? null);
  const queryKey = JSON.stringify([month, category, search, appliedCriteria, appliedLocations]);
  const pageRef = useRef(page);
  pageRef.current = page;
  const load = useCallback(async (nextPage = 1, quiet = false) => {
    if (!allowed) return;
    const version = ++requestVersion.current;
    setError('');
    setLoading(nextPage === 1 && !quiet); setLoadingMore(nextPage > 1 && !quiet);
    try {
      const filters = { month: month === 'All months' ? '' : month, category: categories[category], search, ...appliedCriteria, locations: appliedLocations };
      // Revalidate all loaded pages after an edit without dropping the reader to page one.
      const pages = quiet ? Array.from({ length: pageRef.current }, (_, index) => index + 1) : [nextPage];
      const results = await Promise.all(pages.map(page => api.getMonthlyInventory({ ...filters, page })));
      const result = results[results.length - 1];
      if (version !== requestVersion.current) return;
      setItems(previous => quiet ? results.flatMap(result => result.items) : nextPage === 1 ? result.items : [...previous, ...result.items]);
      loadedQuery.current = queryKey;
      bookSession.loadedQuery = queryKey;
      bookSession.updatedAt = Date.now();
      setLocationOptions(result.locations || []); setMonths(result.months); setTotal(result.total); setPage(result.page); setHasMore(result.has_more);
    } catch (e) {
      if (version === requestVersion.current) setError(e instanceof Error ? e.message : 'Could not load monthly inventory.');
    } finally {
      if (version === requestVersion.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [allowed, month, category, search, appliedCriteria, appliedLocations, queryKey]);
  const hasFocused = useRef(false);
  useFocusEffect(useCallback(() => {
    const sameQuery = loadedQuery.current === queryKey;
    if (!sameQuery) {
      setItems([]); setHasMore(false);
      void load();
    } else {
      setLoading(false);
      // A mounted route regaining focus may have returned from a lead edit/conversion.
      if (hasFocused.current || Date.now() - (bookSession.updatedAt || 0) > 60_000) void load(1, true);
    }
    hasFocused.current = true;
    return () => { requestVersion.current++; };
  }, [load, queryKey]));
  const confirmDelete = (id: number) => {
    if (deletingId !== null) return;
    Alert.alert('Delete book inventory?', 'This hides matching inventory from all books in this category and skips it in future imports. Existing main inventory leads are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setDeletingId(id);
        try { await api.deleteMonthlyInventory(id); await load(1, true); }
        catch (e) { Alert.alert('Could not delete', e instanceof Error ? e.message : 'Please try again.'); }
        finally { setDeletingId(null); }
      } },
    ]);
  };
  const pdfUrl = `${API_URL}/api/monthly-inventory/pdfs/${pdfId}`;
  const heading = <View style={styles.header}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={24} color={colors.ink} /></TouchableOpacity>
    <Text style={styles.title}>Monthly Inventory Books</Text>
  </View>;
  if (!allowed) return <SafeAreaView style={styles.screen}>{heading}<Text style={styles.empty}>Monthly inventory books are available only to vsawariya.</Text></SafeAreaView>;
  return <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
    {heading}
    <FlatList data={items} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.primary} />}
      ListHeaderComponent={<View style={styles.filters}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Search criteria" accessibilityState={{ expanded: criteriaExpanded }}
          style={styles.criteriaToggle} onPress={() => setCriteriaExpanded(previous => !previous)}>
          <Text style={styles.cardTitle}>Search criteria</Text>
          <Ionicons name={criteriaExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.primary} />
        </TouchableOpacity>
        {criteriaExpanded && <View style={styles.criteriaPanel}>
        <View style={styles.filterRow}>
          <View style={styles.filter}><CustomDropdown label="Book month" value={month} options={['All months', ...months]} onSelect={setMonth} /></View>
          <View style={styles.filter}><CustomDropdown label="Category" value={category} options={Object.keys(categories)} onSelect={setCategory} /></View>
        </View>
        <View>
          <SearchableMultiSelect label="Location" selectedValues={selectedLocations} options={locationOptions}
            placeholder="All locations" searchPlaceholder="Search locations..."
            onToggle={value => setSelectedLocations(previous => previous.includes(value) ? previous.filter(location => location !== value) : [...previous, value])} />
        </View>
        <View style={styles.criteriaGrid}>
          {([['address', 'Address'], ['owner_name', 'Builder / owner'], ['phone', 'Phone'], ['floor', 'Floor'], ['min_area', 'Minimum area'], ['max_area', 'Maximum area']] as const).map(([key, label]) =>
            <View key={key} style={styles.criteriaField}>
              <Text style={styles.muted}>{label}</Text>
              <TextInput accessibilityLabel={label} placeholder={label} value={criteria[key]}
                keyboardType={key === 'phone' ? 'phone-pad' : key.endsWith('area') ? 'decimal-pad' : 'default'}
                onChangeText={value => setCriteria(previous => ({ ...previous, [key]: value }))}
                style={styles.criteriaInput} returnKeyType="search" onSubmitEditing={applySearch} />
            </View>)}
        </View>
        <TouchableOpacity accessibilityRole="button" onPress={() => { setSelectedLocations([]); setAppliedLocations([]); setCriteria(emptyCriteria); setAppliedCriteria(emptyCriteria); setMonth('All months'); setCategory('All categories'); setSearchInput(''); setSearch(''); }}>
          <Text style={styles.actionText}>Reset filters</Text>
        </TouchableOpacity>
        <View style={styles.searchRow}>
          <TextInput accessibilityLabel="Search monthly inventory" placeholder="Address, location, name or phone" value={searchInput} onChangeText={setSearchInput}
            style={styles.search} returnKeyType="search" onSubmitEditing={applySearch} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Search" style={styles.searchButton} onPress={applySearch}><Ionicons name="search" size={20} color={colors.white} /></TouchableOpacity>
        </View>
        </View>}
        <Text style={styles.muted}>{total} inventories · Pull down to refresh</Text>
        {!!error && <View style={styles.errorBox}><Text style={styles.error}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => void load()}><Text style={styles.actionText}>Retry</Text></TouchableOpacity></View>}
      </View>}
      ListEmptyComponent={<View style={styles.empty}>{loading ? <ActivityIndicator color={colors.primary} /> : !error && <Text style={styles.muted}>No inventory found for these filters.</Text>}</View>}
      renderItem={({ item }) => <BookCard item={item} onStatusSaved={(id, inventory_status) => setItems(previous => previous.map(entry => entry.id === id ? { ...entry, inventory_status } : entry))} onDelete={confirmDelete} deleting={deletingId === item.id} onPdf={id => { setPdfError(''); setPdfId(id); }} />}
      ListFooterComponent={hasMore ? <TouchableOpacity accessibilityRole="button" disabled={loading || loadingMore} style={styles.loadMore} onPress={() => void load(page + 1)}>
        {loadingMore ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.actionText}>Load more</Text>}
      </TouchableOpacity> : null} />
    <Modal visible={pdfId !== null} animationType="slide" onRequestClose={() => setPdfId(null)}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.header}><Text style={[styles.title, { flex: 1 }]}>Book PDF</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Close PDF" onPress={() => setPdfId(null)} style={styles.back}><Ionicons name="close" size={26} color={colors.ink} /></TouchableOpacity></View>
        {pdfError ? <Text style={[styles.empty, styles.error]}>{pdfError}</Text> : pdfId !== null && <WebView
          source={{ uri: pdfUrl, headers: { Authorization: `Bearer ${getAuthToken() || ''}` } }}
          startInLoadingState renderLoading={() => <View style={styles.pdfLoading}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Loading book PDF… Large books may take a moment.</Text></View>}
          onError={() => setPdfError('Unable to load this PDF. Close and try again when connected.')}
          onHttpError={() => setPdfError('This PDF is unavailable or your session has expired.')}
          onShouldStartLoadWithRequest={request => request.url === pdfUrl || request.url === 'about:blank'}
          javaScriptEnabled={false} incognito style={{ flex: 1 }} />}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, backgroundColor: colors.surface },
  back: { padding: 8 }, title: { fontSize: 19, fontWeight: '700', color: colors.ink, flexShrink: 1 },
  list: { padding: 16, paddingBottom: 32 }, filters: { gap: 12, marginBottom: 16 },
  criteriaToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  criteriaPanel: { gap: 12 },
  criteriaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  criteriaField: { width: '47%', flexGrow: 1, gap: 6 },
  criteriaInput: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, backgroundColor: colors.surfaceRaised, color: colors.ink },
  filterRow: { flexDirection: 'row', gap: 12 }, filter: { flex: 1 },
  searchRow: { flexDirection: 'row', gap: 8 }, search: { flex: 1, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: 12, color: colors.ink },
  searchButton: { justifyContent: 'center', paddingHorizontal: 14, borderRadius: radii.sm, backgroundColor: colors.primary },
  card: { padding: 16, marginBottom: 12, borderRadius: radii.lg, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.ink }, phone: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  address: { color: colors.ink, fontSize: 15, lineHeight: 21 }, muted: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, tag: { fontSize: 11, color: colors.inkMuted, backgroundColor: colors.surfaceMuted, paddingVertical: 5, paddingHorizontal: 8, borderRadius: radii.pill },
  noteButton: { paddingVertical: 6 }, note: { fontSize: 13, lineHeight: 20, color: colors.inkMuted },
  actions: { flexDirection: 'row', gap: 6, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  action: { flex: 1, minHeight: 40, paddingVertical: 8, paddingHorizontal: 4, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary }, actionText: { color: colors.primary, fontSize: 12, fontWeight: '600' }, disabled: { opacity: 0.45 },
  errorBox: { backgroundColor: colors.dangerSoft, padding: 12, borderRadius: radii.sm, gap: 8 }, error: { color: colors.danger },
  empty: { padding: 24 }, loadMore: { alignItems: 'center', padding: 16 },
  pdfLoading: { position: 'absolute', top: 30, left: 20, right: 20, alignItems: 'center', gap: 12 },
});
