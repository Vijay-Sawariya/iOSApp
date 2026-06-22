import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../services/api';
import { colors, radii, shadows } from '../constants/theme';

const dateLabel = (value?: string) => {
  if (!value) return '';
  const date = new Date(`${value}T09:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export default function PerformanceScreen() {
  const [days, setDays] = useState(30);
  const [agentId, setAgentId] = useState<number | undefined>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPerformance = useCallback(async (selectedDays = days, selectedAgentId = agentId) => {
    try {
      const result = await api.getMobilePerformance(selectedDays, selectedAgentId);
      setData(result);
      if (!selectedAgentId && result?.agent?.id) setAgentId(result.agent.id);
    } catch (error: any) {
      Alert.alert('Performance', error?.message || 'Unable to load performance data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [agentId, days]);

  useFocusEffect(
    useCallback(() => {
      loadPerformance();
    }, [loadPerformance])
  );

  const selectDays = (value: number) => {
    setDays(value);
    setLoading(true);
    loadPerformance(value, agentId);
  };

  const selectAgent = (id: number) => {
    setAgentId(id);
    setLoading(true);
    loadPerformance(days, id);
  };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading performance pulse...</Text>
      </SafeAreaView>
    );
  }

  const summary = data?.summary || {};
  const metrics = [
    { label: 'Completed', value: summary.actions_completed || 0, icon: 'checkmark-circle', color: colors.accent, bg: colors.accentSoft },
    { label: 'Overdue', value: summary.overdue_actions || 0, icon: 'alert-circle', color: colors.danger, bg: colors.dangerSoft },
    { label: 'Completion', value: `${summary.completion_rate || 0}%`, icon: 'stats-chart', color: colors.primary, bg: colors.primarySoft },
    { label: 'On time', value: `${summary.on_time_rate || 0}%`, icon: 'time', color: colors.amber, bg: colors.amberSoft },
    { label: 'Portfolio', value: summary.open_portfolio || 0, icon: 'briefcase', color: colors.purple, bg: colors.purpleSoft },
    { label: 'Visits', value: summary.site_visits || 0, icon: 'walk', color: '#0F766E', bg: '#E6F7F4' },
    { label: 'New leads', value: summary.leads_created || 0, icon: 'person-add', color: '#2563EB', bg: '#EAF2FF' },
    { label: 'Won', value: summary.won_leads || 0, icon: 'trophy', color: '#A16207', bg: '#FFF8E1' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Performance Pulse</Text>
          <Text style={styles.subtitle}>
            {data?.agent?.full_name || data?.agent?.username || 'My performance'} · {dateLabel(data?.from)}–{dateLabel(data?.to)}
          </Text>
        </View>
        <TouchableOpacity style={styles.headerButton} onPress={() => loadPerformance()}>
          <Ionicons name="refresh" size={19} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadPerformance();
            }}
          />
        }
      >
        <View style={styles.rangeRow}>
          {[7, 30, 90].map((value) => (
            <TouchableOpacity
              key={value}
              style={[styles.rangeButton, days === value && styles.rangeButtonActive]}
              onPress={() => selectDays(value)}
            >
              <Text style={[styles.rangeText, days === value && styles.rangeTextActive]}>{value} days</Text>
            </TouchableOpacity>
          ))}
        </View>

        {Array.isArray(data?.agents) && data.agents.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.agentRow}>
            {data.agents.map((agent: any) => (
              <TouchableOpacity
                key={agent.id}
                style={[styles.agentChip, agentId === agent.id && styles.agentChipActive]}
                onPress={() => selectAgent(agent.id)}
              >
                <Text style={[styles.agentChipText, agentId === agent.id && styles.agentChipTextActive]}>
                  {agent.full_name || agent.username}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        {loading ? <ActivityIndicator style={styles.inlineLoader} color={colors.primary} /> : null}

        <View style={styles.metricGrid}>
          {metrics.map((metric) => (
            <View key={metric.label} style={styles.metricCard}>
              <View style={[styles.metricIcon, { backgroundColor: metric.bg }]}>
                <Ionicons name={metric.icon as any} size={18} color={metric.color} />
              </View>
              <Text style={[styles.metricValue, { color: metric.color }]}>{metric.value}</Text>
              <Text style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.focusCard}>
          <View style={styles.focusHeader}>
            <View>
              <Text style={styles.sectionTitle}>Needs attention</Text>
              <Text style={styles.sectionSubtitle}>Oldest overdue actions first</Text>
            </View>
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueBadgeText}>{data?.overdue?.length || 0}</Text>
            </View>
          </View>

          {Array.isArray(data?.overdue) && data.overdue.length ? data.overdue.map((item: any) => (
            <TouchableOpacity
              key={item.id}
              style={styles.overdueItem}
              onPress={() => item.lead_id
                ? router.push(`/leads/${item.lead_id}` as any)
                : router.push(`/reminders/edit/${item.id}` as any)}
            >
              <View style={styles.overdueIcon}>
                <Ionicons name="alert" size={15} color={colors.danger} />
              </View>
              <View style={styles.overdueCopy}>
                <Text style={styles.overdueTitle} numberOfLines={1}>{item.lead_name || item.title}</Text>
                <Text style={styles.overdueMeta} numberOfLines={1}>{item.title} · {item.action_type || 'Action'}</Text>
              </View>
              <Text style={styles.overdueHours}>{item.hours_overdue || 0}h</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.inkSubtle} />
            </TouchableOpacity>
          )) : (
            <View style={styles.emptyFocus}>
              <Ionicons name="checkmark-circle" size={28} color={colors.accent} />
              <Text style={styles.emptyFocusText}>No overdue actions. Nicely done.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  muted: { marginTop: 10, color: colors.inkMuted },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surfaceRaised,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  headerCopy: { flex: 1, marginHorizontal: 12 },
  title: { fontSize: 20, fontWeight: '900', color: colors.ink },
  subtitle: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  content: { padding: 16, paddingBottom: 36 },
  rangeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  rangeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeText: { fontSize: 12, fontWeight: '800', color: colors.inkMuted },
  rangeTextActive: { color: colors.white },
  agentRow: { gap: 8, paddingBottom: 14 },
  agentChip: {
    paddingHorizontal: 13,
    minHeight: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  agentChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  agentChipText: { fontSize: 12, fontWeight: '800', color: colors.inkMuted },
  agentChipTextActive: { color: colors.primary },
  inlineLoader: { marginBottom: 10 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    width: '48%',
    borderRadius: radii.lg,
    padding: 14,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  metricIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: { fontSize: 25, fontWeight: '900', marginTop: 10 },
  metricLabel: { fontSize: 12, color: colors.inkMuted, fontWeight: '700', marginTop: 2 },
  focusCard: {
    marginTop: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.card,
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: colors.ink },
  sectionSubtitle: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  overdueBadge: {
    minWidth: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  overdueBadgeText: { color: colors.danger, fontWeight: '900' },
  overdueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  overdueIcon: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerSoft,
  },
  overdueCopy: { flex: 1 },
  overdueTitle: { fontSize: 13, fontWeight: '900', color: colors.ink },
  overdueMeta: { fontSize: 11, color: colors.inkMuted, marginTop: 2 },
  overdueHours: { fontSize: 11, color: colors.danger, fontWeight: '900' },
  emptyFocus: { alignItems: 'center', padding: 24 },
  emptyFocusText: { fontSize: 13, color: colors.inkMuted, marginTop: 8 },
});
