import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api } from '../services/api';
import { colors, radii, shadows } from '../constants/theme';

const formatDate = (value: unknown) => {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function PerformanceDetailsScreen() {
  const params = useLocalSearchParams<{ metric?: string; title?: string; days?: string; agentId?: string; agentName?: string }>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const metric = params.metric || '';

  const load = useCallback(async () => {
    try {
      const result = await api.getMobilePerformance(Number(params.days || 30), Number(params.agentId || 0) || undefined, metric);
      setItems(Array.isArray(result?.details?.[metric]) ? result.details[metric] : []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [metric, params.agentId, params.days]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const subtitle = useMemo(() => `${params.agentName || 'Agent'} · ${items.length} record${items.length === 1 ? '' : 's'}`, [items.length, params.agentName]);

  const renderItem = ({ item }: { item: any }) => {
    const title = item.lead_name || item.name || item.property_name || item.title || `Record #${item.id}`;
    const meta = [item.lead_type, item.lead_status || item.status, item.action_type || item.visit_type, item.location || item.property_location]
      .filter(Boolean).join(' · ');
    const date = formatDate(item.created_at || item.due_date || item.visit_date || item.completed_at);
    const canOpenLead = Boolean(item.lead_id || (['portfolio', 'new_leads', 'won'].includes(metric) && item.id));
    const leadId = item.lead_id || item.id;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={canOpenLead ? 0.7 : 1}
        disabled={!canOpenLead}
        onPress={() => router.push(`/leads/${leadId}` as any)}
      >
        <View style={styles.cardIcon}><Ionicons name={metric.includes('overdue') ? 'alert' : 'document-text'} size={18} color={colors.primary} /></View>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle} numberOfLines={2}>{title}</Text>
          {meta ? <Text style={styles.cardMeta} numberOfLines={2}>{meta}</Text> : null}
          {date ? <Text style={styles.cardDate}>{date}</Text> : null}
          {item.phone ? <Text style={styles.cardMeta}>{item.phone}</Text> : null}
          {item.hours_overdue != null ? <Text style={styles.overdue}>{item.hours_overdue}h overdue</Text> : null}
        </View>
        {canOpenLead ? <Ionicons name="chevron-forward" size={18} color={colors.inkSubtle} /> : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={colors.ink} /></TouchableOpacity>
        <View style={styles.headerCopy}><Text style={styles.title}>{params.title || 'Performance details'}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>
        <TouchableOpacity style={styles.headerButton} onPress={() => { setRefreshing(true); void load(); }}><Ionicons name="refresh" size={19} color={colors.primary} /></TouchableOpacity>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View> : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.id || item.lead_id || 'item'}-${index}`}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="file-tray-outline" size={48} color={colors.inkSubtle} /><Text style={styles.emptyTitle}>No matching records</Text><Text style={styles.emptyText}>The badge currently has no detail records for this period.</Text></View>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.surfaceRaised, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerButton: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  headerCopy: { flex: 1, marginHorizontal: 12 }, title: { fontSize: 20, fontWeight: '900', color: colors.ink }, subtitle: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, list: { padding: 16, gap: 10, flexGrow: 1 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radii.lg, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, ...shadows.card },
  cardIcon: { width: 38, height: 38, borderRadius: radii.md, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  cardCopy: { flex: 1 }, cardTitle: { fontSize: 15, fontWeight: '800', color: colors.ink }, cardMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 3 }, cardDate: { fontSize: 12, color: colors.inkSubtle, marginTop: 4 }, overdue: { fontSize: 12, fontWeight: '800', color: colors.danger, marginTop: 4 },
  empty: { flex: 1, minHeight: 420, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { marginTop: 14, fontSize: 18, fontWeight: '800', color: colors.ink }, emptyText: { marginTop: 6, fontSize: 13, color: colors.inkMuted, textAlign: 'center' },
});
