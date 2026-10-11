import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { WebView } from 'react-native-webview';
import { api, getAuthToken } from '../services/api';
import { API_URL } from '../constants/config';
import { useAuth } from '../contexts/AuthContext';
import { colors, radii } from '../constants/theme';
import { CustomDropdown } from '../components/forms/CustomDropdown';
import { MonthlyEntry, conversionParams } from '../services/monthlyInventory';

const categories: Record<string, string> = {
  'All categories': '', 'Residential sale': 'residential_sale', 'Residential rent': 'residential_rent',
  'Commercial sale': 'commercial_sale', 'Commercial rent': 'commercial_rent',
};

function BookCard({ item, onPdf }: { item: MonthlyEntry; onPdf: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const leadId = item.converted_lead_id || item.matching_lead_id;
  return <View style={styles.card}>
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
    <View style={styles.actions}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={item.pdf_id ? 'View book PDF' : 'Book PDF not uploaded'} disabled={!item.pdf_id}
        style={[styles.action, !item.pdf_id && styles.disabled]} onPress={() => item.pdf_id && onPdf(item.pdf_id)}>
        <Ionicons name="document-text-outline" size={15} color={colors.primary} /><Text style={styles.actionText}>{item.pdf_id ? 'View PDF' : 'No PDF'}</Text>
      </TouchableOpacity>
      {!!leadId && <TouchableOpacity accessibilityRole="button" style={styles.action} onPress={() => router.push(`/leads/${leadId}` as any)}>
        <Ionicons name="open-outline" size={15} color={colors.primary} /><Text style={styles.actionText}>View Lead</Text>
      </TouchableOpacity>}
      {!item.converted_lead_id && <TouchableOpacity accessibilityRole="button" style={[styles.action, styles.primary]} onPress={() => router.push({ pathname: '/leads/add', params: conversionParams(item) } as any)}>
        <Ionicons name="swap-horizontal" size={15} color={colors.white} /><Text style={[styles.actionText, { color: colors.white }]}>Convert</Text>
      </TouchableOpacity>}
    </View>
  </View>;
}

export default function MonthlyInventoryScreen() {
  const { user } = useAuth();
  const allowed = user?.username === 'vsawariya';
  const [items, setItems] = useState<MonthlyEntry[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [month, setMonth] = useState('All months');
  const [category, setCategory] = useState('All categories');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pdfId, setPdfId] = useState<number | null>(null);
  const [pdfError, setPdfError] = useState('');
  const requestVersion = useRef(0);
  const load = useCallback(async (nextPage = 1) => {
    if (!allowed) return;
    const version = ++requestVersion.current;
    setError('');
    setLoading(nextPage === 1); setLoadingMore(nextPage > 1);
    try {
      const result = await api.getMonthlyInventory({ month: month === 'All months' ? '' : month, category: categories[category], search, page: nextPage });
      if (version !== requestVersion.current) return;
      setItems(previous => nextPage === 1 ? result.items : [...previous, ...result.items]);
      setMonths(result.months); setTotal(result.total); setPage(nextPage); setHasMore(result.has_more);
    } catch (e) {
      if (version === requestVersion.current) setError(e instanceof Error ? e.message : 'Could not load monthly inventory.');
    } finally {
      if (version === requestVersion.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [allowed, month, category, search]);
  useFocusEffect(useCallback(() => {
    setItems([]); setHasMore(false); setPdfId(null);
    void load();
    return () => { requestVersion.current++; };
  }, [load]));
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
        <View style={styles.filterRow}>
          <View style={styles.filter}><CustomDropdown label="Book month" value={month} options={['All months', ...months]} onSelect={setMonth} /></View>
          <View style={styles.filter}><CustomDropdown label="Category" value={category} options={Object.keys(categories)} onSelect={setCategory} /></View>
        </View>
        <View style={styles.searchRow}>
          <TextInput accessibilityLabel="Search monthly inventory" placeholder="Address, location, name or phone" value={searchInput} onChangeText={setSearchInput}
            style={styles.search} returnKeyType="search" onSubmitEditing={() => setSearch(searchInput.trim())} />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Search" style={styles.searchButton} onPress={() => setSearch(searchInput.trim())}><Ionicons name="search" size={20} color={colors.white} /></TouchableOpacity>
        </View>
        <Text style={styles.muted}>{total} inventories · Pull down to refresh</Text>
        {!!error && <View style={styles.errorBox}><Text style={styles.error}>{error}</Text><TouchableOpacity accessibilityRole="button" onPress={() => void load()}><Text style={styles.actionText}>Retry</Text></TouchableOpacity></View>}
      </View>}
      ListEmptyComponent={<View style={styles.empty}>{loading ? <ActivityIndicator color={colors.primary} /> : !error && <Text style={styles.muted}>No inventory found for these filters.</Text>}</View>}
      renderItem={({ item }) => <BookCard item={item} onPdf={id => { setPdfError(''); setPdfId(id); }} />}
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
