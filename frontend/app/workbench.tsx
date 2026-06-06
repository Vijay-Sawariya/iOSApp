import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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

const callPhone = (phone?: string) => {
  if (phone) Linking.openURL(`tel:${phone}`);
};

const openWhatsApp = (phone?: string, name?: string) => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(`Hi ${name || ''}, `)}`);
};

const formatDate = (value?: string) => {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

export default function WorkbenchScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (force = false) => {
    try {
      const result = await api.getMobileWorkbench(force ? { forceRefresh: true } : undefined);
      setData(result || {});
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load workbench');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const markDone = async (id: number) => {
    try {
      await api.updateReminder(String(id), { status: 'completed' });
      loadData(true);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to complete follow-up');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading workbench...</Text>
      </SafeAreaView>
    );
  }

  const summary = data?.summary || {};
  const actions = data?.priority_actions || [];
  const hotLeads = data?.hot_leads_without_action || [];
  const legacyInventory = data?.fresh_enquiries || [];
  const notesMissing = data?.notes_missing || [];
  const matches = data?.smart_matches || [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Daily Workbench</Text>
          <Text style={styles.subtitle}>{formatDate(data?.date)} priority queue</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.summaryGrid}>
          <SummaryCard label="Actions" value={summary.priority_actions || 0} color={colors.primary} />
          <SummaryCard label="Hot open" value={summary.hot_leads_without_action || 0} color={colors.danger} />
          <SummaryCard label="Legacy" value={summary.fresh_enquiries || 0} color={colors.accent} />
          <SummaryCard label="Notes due" value={summary.notes_missing || 0} color={colors.amber} />
        </View>

        <Section title="Priority Follow-ups" empty="No pending actions for now.">
          {actions.map((item: any) => (
            <View key={`action-${item.id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{item.lead_name || item.title || 'Follow-up'}</Text>
                  <Text style={styles.cardMeta}>{item.title || item.action_type || 'Action'} · {formatDate(item.due_date)}</Text>
                </View>
                <Badge text={item.priority || item.status || 'Pending'} tone="amber" />
              </View>
              <Text style={styles.cardBody} numberOfLines={2}>{item.description || 'No description'}</Text>
              <ActionRow
                phone={item.lead_phone}
                name={item.lead_name}
                onOpen={() => item.lead_id && router.push(`/leads/${item.lead_id}` as any)}
                onDone={() => markDone(item.id)}
              />
            </View>
          ))}
        </Section>

        <Section title="Legacy Inventory" empty="No legacy inventory records found.">
          {legacyInventory.map((item: any) => (
            <View key={`enquiry-${item.id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{item.name || 'New enquiry'}</Text>
                  <Text style={styles.cardMeta}>{item.location || 'Location n/a'} · {item.property_type || item.bhk || 'Type n/a'}</Text>
                </View>
                <Badge text={item.status || 'New'} tone="green" />
              </View>
              <Text style={styles.cardBody} numberOfLines={2}>{item.notes || 'No notes yet'}</Text>
              <ActionRow
                phone={item.phone}
                name={item.name}
                onOpen={() => router.push('/legacy-inventory' as any)}
                doneLabel="Inventory"
                onDone={() => router.push(`/leads/add?type=inventory&name=${encodeURIComponent(item.name || '')}&phone=${encodeURIComponent(item.phone || '')}` as any)}
              />
            </View>
          ))}
        </Section>

        <Section title="Hot Leads Without Next Action" empty="Every hot lead has a pending next action.">
          {hotLeads.map((lead: any) => (
            <LeadCard key={`hot-${lead.id}`} lead={lead} />
          ))}
        </Section>

        <Section title="Matching" empty="No smart matches available right now.">
          {matches.map((match: any, index: number) => (
            <View key={`match-${match.buyer_id}-${match.inventory_id}-${index}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{match.buyer_name}</Text>
                  <Text style={styles.cardMeta}>{match.inventory_name} · {match.location || 'Location n/a'}</Text>
                </View>
                <Badge text={`${match.match_score || 0}%`} tone="blue" />
              </View>
              <Text style={styles.cardBody} numberOfLines={2}>{(match.match_reasons || []).join(', ') || 'Potential match'}</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.smallButton} onPress={() => router.push(`/leads/${match.buyer_id}` as any)}>
                  <Ionicons name="person-outline" size={16} color={colors.primary} />
                  <Text style={styles.smallButtonText}>Buyer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallButton} onPress={() => router.push(`/leads/${match.inventory_id}` as any)}>
                  <Ionicons name="home-outline" size={16} color={colors.primary} />
                  <Text style={styles.smallButtonText}>Inventory</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </Section>

        <Section title="Notes Missing" empty="No missing-note leads.">
          {notesMissing.map((lead: any) => (
            <LeadCard key={`notes-${lead.id}`} lead={lead} />
          ))}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const list = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {list.length ? list : <Text style={styles.emptyText}>{empty}</Text>}
    </View>
  );
}

function LeadCard({ lead }: { lead: any }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{lead.name || 'Lead'}</Text>
          <Text style={styles.cardMeta}>{lead.lead_type || 'lead'} · {lead.location || 'Location n/a'}</Text>
        </View>
        <Badge text={lead.lead_temperature || lead.lead_status || 'Open'} tone="red" />
      </View>
      <Text style={styles.cardBody} numberOfLines={1}>{lead.bhk || lead.area_size || lead.budget_max ? `${lead.bhk || ''} ${lead.area_size || ''} ${lead.budget_max || ''}` : 'Requirement details pending'}</Text>
      <ActionRow
        phone={lead.phone}
        name={lead.name}
        onOpen={() => router.push(`/leads/${lead.id}` as any)}
        doneLabel="Reminder"
        onDone={() => router.push(`/reminders/add?lead_id=${lead.id}&lead_name=${encodeURIComponent(lead.name || '')}` as any)}
      />
    </View>
  );
}

function ActionRow({ phone, name, onOpen, onDone, doneLabel = 'Done' }: { phone?: string; name?: string; onOpen: () => void; onDone: () => void; doneLabel?: string }) {
  return (
    <View style={styles.actions}>
      <TouchableOpacity style={styles.iconAction} onPress={() => callPhone(phone)} disabled={!phone}>
        <Ionicons name="call" size={17} color={phone ? colors.accent : colors.inkSubtle} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconAction} onPress={() => openWhatsApp(phone, name)} disabled={!phone}>
        <Ionicons name="logo-whatsapp" size={17} color={phone ? '#25D366' : colors.inkSubtle} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.smallButton} onPress={onOpen}>
        <Ionicons name="open-outline" size={16} color={colors.primary} />
        <Text style={styles.smallButtonText}>Open</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.smallButton, styles.primarySmallButton]} onPress={onDone}>
        <Text style={styles.primarySmallButtonText}>{doneLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function Badge({ text, tone }: { text: string; tone: 'amber' | 'green' | 'blue' | 'red' }) {
  const bg = tone === 'green' ? colors.accentSoft : tone === 'blue' ? colors.primarySoft : tone === 'red' ? colors.dangerSoft : colors.amberSoft;
  const fg = tone === 'green' ? colors.accent : tone === 'blue' ? colors.primary : tone === 'red' ? colors.danger : colors.amber;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]} numberOfLines={1}>{text}</Text>
    </View>
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
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  summaryCard: {
    width: '48%',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    padding: 14,
    ...shadows.card,
  },
  summaryValue: { fontSize: 24, fontWeight: '900' },
  summaryLabel: { fontSize: 12, color: colors.inkMuted, fontWeight: '700', marginTop: 2 },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginBottom: 10 },
  emptyText: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    padding: 14,
    color: colors.inkMuted,
  },
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
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  cardBody: { fontSize: 12, color: colors.inkMuted, marginTop: 10, lineHeight: 18 },
  badge: { maxWidth: 92, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.pill },
  badgeText: { fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  smallButton: {
    minHeight: 34,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: colors.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  smallButtonText: { fontSize: 12, fontWeight: '800', color: colors.primary },
  primarySmallButton: { backgroundColor: colors.primary },
  primarySmallButtonText: { fontSize: 12, fontWeight: '800', color: colors.white },
});
