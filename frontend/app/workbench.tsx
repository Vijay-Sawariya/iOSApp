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

const openWhatsApp = async (phone?: string, name?: string, messageOverride?: string, leadId?: number, source = 'ios_workbench') => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  const message = messageOverride || `Hi ${name || ''}, `;
  await api.sendWhatsApp({
    phone,
    message,
    lead_id: leadId ? String(leadId) : undefined,
    status: 'opened',
    source,
  }).catch((error) => console.warn('WhatsApp log failed:', error));
  Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`);
};

const formatDate = (value?: string) => {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const formatCr = (value?: number | string | null) => {
  const amount = Number(value || 0);
  if (!amount) return '';
  return `₹${amount} CR`;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const nextFollowupAt = (days: number) => {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return `${isoDate(next)}T10:00`;
};

export default function WorkbenchScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingMatchKey, setSavingMatchKey] = useState<string | null>(null);

  const loadData = async (force = false) => {
    try {
      const result = await api.getMobileWorkbench(force ? { forceNetwork: true } : undefined);
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

  const recordOutcome = async (
    leadId: number | undefined,
    actionId: number | undefined,
    channel: 'Call' | 'WhatsApp',
    outcome: 'Connected' | 'WhatsApp Sent' | 'No Answer',
    nextDays: number,
  ) => {
    if (!leadId) {
      Alert.alert('Lead Missing', 'This action is not linked with a lead.');
      return;
    }

    const key = `${leadId}-${actionId || 'lead'}-${outcome}`;
    setSavingKey(key);
    try {
      const nextAt = nextFollowupAt(nextDays);
      await api.createFollowup(String(leadId), {
        channel,
        outcome,
        notes: `${outcome} from Today Action Center`,
        followup_date: isoDate(new Date()),
        next_followup: nextAt,
      });

      await api.createReminder({
        lead_id: leadId,
        title: `${channel} follow-up`,
        reminder_date: nextAt,
        reminder_type: channel,
        notes: `Auto scheduled after ${outcome}`,
        priority: outcome === 'No Answer' ? 'High' : 'Medium',
      });

      if (actionId) {
        await api.updateReminder(String(actionId), { status: 'completed', outcome });
      }

      await loadData(true);
    } catch (error: any) {
      Alert.alert('Update Failed', error?.message || 'Could not save action outcome');
    } finally {
      setSavingKey(null);
    }
  };

  const savePreferredMatch = async (buyerId?: number, inventoryId?: number) => {
    if (!buyerId || !inventoryId) {
      Alert.alert('Match Missing', 'This match is missing a buyer or inventory record.');
      return;
    }

    const key = `${buyerId}-${inventoryId}`;
    setSavingMatchKey(key);
    try {
      await api.addPreferredLeads(buyerId, [inventoryId]);
      await loadData(true);
    } catch (error: any) {
      Alert.alert('Save Failed', error?.message || 'Could not save preferred inventory');
    } finally {
      setSavingMatchKey(null);
    }
  };

  const sendSuggestedWhatsApp = async (lead: any) => {
    if (!lead?.phone) {
      Alert.alert('No Phone', 'This lead does not have a WhatsApp number.');
      return;
    }

    const key = `${lead.id}-lead-WhatsApp Sent`;
    setSavingKey(key);
    try {
      const message = lead.suggested_message || `Hi ${lead.name || ''}, `;
      const nextDays = Number(lead.suggested_next_followup_days || 2);
      const nextAt = nextFollowupAt(nextDays);
      await openWhatsApp(lead.phone, lead.name, message, lead.id, 'ios_whatsapp_intelligence');
      await api.createFollowup(String(lead.id), {
        channel: 'WhatsApp',
        outcome: 'WhatsApp Sent',
        notes: `Suggested WhatsApp sent: ${message}`,
        followup_date: isoDate(new Date()),
        next_followup: nextAt,
      });
      await api.createReminder({
        lead_id: lead.id,
        title: 'WhatsApp follow-up',
        reminder_date: nextAt,
        reminder_type: 'WhatsApp',
        notes: `Auto scheduled from WhatsApp intelligence. Reason: ${lead.whatsapp_reason || 'Follow-up due'}`,
        priority: lead.whatsapp_priority === 'High' ? 'High' : 'Medium',
      });
      await loadData(true);
    } catch (error: any) {
      Alert.alert('WhatsApp Failed', error?.message || 'Could not send suggested WhatsApp');
    } finally {
      setSavingKey(null);
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
  const missedActions = data?.missed_actions || [];
  const todayActions = data?.today_actions || [];
  const whatsappDue = data?.whatsapp_due_leads || [];
  const hotLeads = data?.hot_leads_without_action || [];
  const legacyInventory = data?.fresh_enquiries || [];
  const notesMissing = data?.notes_missing || [];
  const matches = data?.smart_matches || [];
  const primaryQueue = [...missedActions, ...todayActions];

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
          <SummaryCard label="Missed" value={summary.missed_actions || 0} color={colors.danger} />
          <SummaryCard label="Today" value={summary.today_actions || 0} color={colors.primary} />
          <SummaryCard label="WA due" value={summary.whatsapp_due_leads || 0} color={colors.accent} />
          <SummaryCard label="Hot open" value={summary.hot_leads_without_action || 0} color={colors.amber} />
          <SummaryCard label="Matches" value={summary.smart_matches || matches.length || 0} color={colors.primary} />
        </View>

        <Section title="Today Action Center" empty="No missed or due actions for now.">
          {primaryQueue.map((item: any) => (
            <View key={`action-${item.id}`} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{item.lead_name || item.title || 'Follow-up'}</Text>
                  <Text style={styles.cardMeta}>{item.title || item.action_type || 'Action'} · {formatDate(item.due_date)}</Text>
                </View>
                <Badge text={item.due_date && item.due_date < data?.date ? 'Missed' : item.priority || item.status || 'Today'} tone={item.due_date && item.due_date < data?.date ? 'red' : 'amber'} />
              </View>
              <Text style={styles.cardBody} numberOfLines={2}>{item.description || 'No description'}</Text>
              <ActionRow
                leadId={item.lead_id}
                actionId={item.id}
                phone={item.lead_phone}
                name={item.lead_name}
                onOpen={() => item.lead_id && router.push(`/leads/${item.lead_id}` as any)}
                onDone={() => markDone(item.id)}
                onOutcome={recordOutcome}
                savingKey={savingKey}
              />
            </View>
          ))}
        </Section>

        <Section title="WhatsApp Follow-up Due" empty="No leads are due for WhatsApp follow-up.">
          {whatsappDue.map((lead: any) => (
            <LeadCard
              key={`wa-${lead.id}`}
              lead={lead}
              metaExtra={lead.last_message_sent_on ? `Last WA ${formatDate(lead.last_message_sent_on)}` : 'Never messaged'}
              onOutcome={recordOutcome}
              onSuggestedWhatsApp={sendSuggestedWhatsApp}
              savingKey={savingKey}
            />
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
            <LeadCard key={`hot-${lead.id}`} lead={lead} onOutcome={recordOutcome} savingKey={savingKey} />
          ))}
        </Section>

        <Section title="Smart Matching Inbox" empty="No smart matches available right now.">
          {matches.map((match: any, index: number) => (
            <MatchCard
              key={`match-${match.buyer_id}-${match.inventory_id}-${index}`}
              match={match}
              saving={savingMatchKey === `${match.buyer_id}-${match.inventory_id}`}
              onSave={() => savePreferredMatch(match.buyer_id, match.inventory_id)}
            />
          ))}
        </Section>

        <Section title="Notes Missing" empty="No missing-note leads.">
          {notesMissing.map((lead: any) => (
            <LeadCard key={`notes-${lead.id}`} lead={lead} onOutcome={recordOutcome} savingKey={savingKey} />
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

function LeadCard({
  lead,
  metaExtra,
  onOutcome,
  onSuggestedWhatsApp,
  savingKey,
}: {
  lead: any;
  metaExtra?: string;
  onOutcome?: (leadId: number | undefined, actionId: number | undefined, channel: 'Call' | 'WhatsApp', outcome: 'Connected' | 'WhatsApp Sent' | 'No Answer', nextDays: number) => void;
  onSuggestedWhatsApp?: (lead: any) => void;
  savingKey?: string | null;
}) {
  const waSaving = savingKey === `${lead.id}-lead-WhatsApp Sent`;
  const hasWhatsAppIntel = Boolean(lead.suggested_message || lead.whatsapp_reason);
  const badgeTone = lead.whatsapp_priority
    ? (lead.whatsapp_priority === 'High' ? 'red' : 'amber')
    : 'red';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardCopy}>
          <Text style={styles.cardTitle}>{lead.name || 'Lead'}</Text>
          <Text style={styles.cardMeta}>{lead.lead_type || 'lead'} · {lead.location || 'Location n/a'}{metaExtra ? ` · ${metaExtra}` : ''}</Text>
        </View>
        <Badge text={lead.whatsapp_priority || lead.lead_temperature || lead.lead_status || 'Open'} tone={badgeTone} />
      </View>
      <Text style={styles.cardBody} numberOfLines={1}>{lead.bhk || lead.area_size || lead.budget_max ? `${lead.bhk || ''} ${lead.area_size || ''} ${lead.budget_max || ''}` : 'Requirement details pending'}</Text>
      {hasWhatsAppIntel ? (
        <View style={styles.whatsappIntelBox}>
          <View style={styles.whatsappIntelHeader}>
            <Ionicons name="sparkles" size={15} color={colors.accent} />
            <Text style={styles.whatsappIntelReason}>{lead.whatsapp_reason || 'WhatsApp follow-up due'}</Text>
          </View>
          {lead.suggested_message ? (
            <Text style={styles.whatsappIntelMessage} numberOfLines={3}>{lead.suggested_message}</Text>
          ) : null}
          <View style={styles.whatsappIntelFooter}>
            <Text style={styles.whatsappIntelMeta}>
              {lead.whatsapp_log_count || 0} WA log(s) · next in {lead.suggested_next_followup_days || 2} day(s)
            </Text>
            {onSuggestedWhatsApp ? (
              <TouchableOpacity
                style={styles.suggestedWaButton}
                onPress={() => onSuggestedWhatsApp(lead)}
                disabled={waSaving}
              >
                <Ionicons name="logo-whatsapp" size={14} color="#FFFFFF" />
                <Text style={styles.suggestedWaButtonText}>{waSaving ? 'Opening...' : 'Send suggested'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      <ActionRow
        leadId={lead.id}
        phone={lead.phone}
        name={lead.name}
        onOpen={() => router.push(`/leads/${lead.id}` as any)}
        doneLabel="Reminder"
        onDone={() => router.push(`/reminders/add?lead_id=${lead.id}&lead_name=${encodeURIComponent(lead.name || '')}` as any)}
        onOutcome={onOutcome}
        savingKey={savingKey}
      />
    </View>
  );
}

function MatchCard({ match, saving, onSave }: { match: any; saving: boolean; onSave: () => void }) {
  const buyerBudget = [formatCr(match.buyer_budget_min), formatCr(match.buyer_budget_max)].filter(Boolean).join(' - ');
  const inventoryPrice = [formatCr(match.inventory_price_min), formatCr(match.inventory_price_max)].filter(Boolean).join(' - ');
  const reasons = Array.isArray(match.match_reasons) ? match.match_reasons : [];

  return (
    <View style={[styles.card, match.is_hot && styles.hotMatchCard]}>
      <View style={styles.cardTop}>
        <View style={styles.cardCopy}>
          <View style={styles.matchTitleRow}>
            <Text style={styles.cardTitle}>{match.buyer_name || 'Client'}</Text>
            <Ionicons name="swap-horizontal" size={15} color={colors.inkMuted} />
            <Text style={styles.cardTitle}>{match.inventory_name || 'Inventory'}</Text>
          </View>
          <Text style={styles.cardMeta}>
            {match.location || 'Location n/a'} · {match.inventory_type || 'inventory'}{match.inventory_status ? ` · ${match.inventory_status}` : ''}
          </Text>
        </View>
        <View style={styles.matchBadges}>
          <Badge text={`${match.match_score || 0}%`} tone={match.is_hot ? 'red' : 'blue'} />
          {match.is_saved ? <Badge text="Saved" tone="green" /> : null}
        </View>
      </View>

      <View style={styles.matchSplit}>
        <View style={styles.matchPane}>
          <Text style={styles.matchPaneLabel}>Client</Text>
          <Text style={styles.matchPaneText} numberOfLines={2}>
            {match.buyer_type || 'buyer'}{match.buyer_temperature ? ` · ${match.buyer_temperature}` : ''}{buyerBudget ? ` · ${buyerBudget}` : ''}
          </Text>
        </View>
        <View style={styles.matchPane}>
          <Text style={styles.matchPaneLabel}>Inventory</Text>
          <Text style={styles.matchPaneText} numberOfLines={2}>
            {[match.inventory_bhk, match.inventory_floor, match.inventory_area_size, inventoryPrice].filter(Boolean).join(' · ') || 'Inventory details pending'}
          </Text>
        </View>
      </View>

      <Text style={styles.cardBody} numberOfLines={2}>{reasons.join(', ') || 'Potential match'}</Text>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.iconAction} onPress={() => callPhone(match.buyer_phone)} disabled={!match.buyer_phone}>
          <Ionicons name="call" size={17} color={match.buyer_phone ? colors.accent : colors.inkSubtle} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconAction} onPress={() => openWhatsApp(match.buyer_phone, match.buyer_name)} disabled={!match.buyer_phone}>
          <Ionicons name="logo-whatsapp" size={17} color={match.buyer_phone ? '#25D366' : colors.inkSubtle} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallButton} onPress={() => router.push(`/leads/${match.buyer_id}` as any)}>
          <Ionicons name="person-outline" size={16} color={colors.primary} />
          <Text style={styles.smallButtonText}>Client</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallButton} onPress={() => router.push(`/leads/${match.inventory_id}` as any)}>
          <Ionicons name="home-outline" size={16} color={colors.primary} />
          <Text style={styles.smallButtonText}>Inventory</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.smallButton, styles.primarySmallButton, match.is_saved && styles.savedSmallButton]}
          onPress={onSave}
          disabled={saving || match.is_saved}
        >
          <Text style={[styles.primarySmallButtonText, match.is_saved && styles.savedSmallButtonText]}>
            {match.is_saved ? 'Preferred' : saving ? 'Saving...' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

type OutcomeHandler = (
  leadId: number | undefined,
  actionId: number | undefined,
  channel: 'Call' | 'WhatsApp',
  outcome: 'Connected' | 'WhatsApp Sent' | 'No Answer',
  nextDays: number,
) => void;

function ActionRow({
  leadId,
  actionId,
  phone,
  name,
  onOpen,
  onDone,
  doneLabel = 'Done',
  onOutcome,
  savingKey,
}: {
  leadId?: number;
  actionId?: number;
  phone?: string;
  name?: string;
  onOpen: () => void;
  onDone: () => void;
  doneLabel?: string;
  onOutcome?: OutcomeHandler;
  savingKey?: string | null;
}) {
  const isSaving = (outcome: string) => savingKey === `${leadId}-${actionId || 'lead'}-${outcome}`;
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
      {onOutcome && (
        <View style={styles.quickOutcomes}>
          <TouchableOpacity
            style={styles.outcomeButton}
            onPress={() => onOutcome(leadId, actionId, 'Call', 'Connected', 2)}
            disabled={isSaving('Connected')}
          >
            <Text style={styles.outcomeButtonText}>{isSaving('Connected') ? 'Saving...' : 'Call done'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outcomeButton}
            onPress={() => onOutcome(leadId, actionId, 'WhatsApp', 'WhatsApp Sent', 2)}
            disabled={isSaving('WhatsApp Sent')}
          >
            <Text style={styles.outcomeButtonText}>{isSaving('WhatsApp Sent') ? 'Saving...' : 'WA sent'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.outcomeButton, styles.noAnswerButton]}
            onPress={() => onOutcome(leadId, actionId, 'Call', 'No Answer', 1)}
            disabled={isSaving('No Answer')}
          >
            <Text style={[styles.outcomeButtonText, styles.noAnswerText]}>{isSaving('No Answer') ? 'Saving...' : 'No answer'}</Text>
          </TouchableOpacity>
        </View>
      )}
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
  hotMatchCard: {
    borderColor: colors.danger,
    backgroundColor: '#FFF7F7',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  cardBody: { fontSize: 12, color: colors.inkMuted, marginTop: 10, lineHeight: 18 },
  whatsappIntelBox: {
    backgroundColor: colors.accentSoft,
    borderRadius: 8,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  whatsappIntelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  whatsappIntelReason: {
    flex: 1,
    fontSize: 12,
    fontWeight: '900',
    color: colors.accent,
  },
  whatsappIntelMessage: {
    fontSize: 12,
    color: colors.ink,
    lineHeight: 17,
    marginTop: 7,
  },
  whatsappIntelFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 9,
  },
  whatsappIntelMeta: {
    flex: 1,
    fontSize: 11,
    color: colors.inkMuted,
    fontWeight: '700',
  },
  suggestedWaButton: {
    minHeight: 30,
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  suggestedWaButtonText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '900',
  },
  matchTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  matchBadges: {
    alignItems: 'flex-end',
    gap: 5,
  },
  matchSplit: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  matchPane: {
    flex: 1,
    minHeight: 56,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    padding: 9,
  },
  matchPaneLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.inkMuted,
    textTransform: 'uppercase',
  },
  matchPaneText: {
    fontSize: 12,
    color: colors.ink,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
  },
  badge: { maxWidth: 92, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.pill },
  badgeText: { fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  quickOutcomes: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  outcomeButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  outcomeButtonText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  noAnswerButton: {
    backgroundColor: colors.dangerSoft,
  },
  noAnswerText: {
    color: colors.danger,
  },
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
  savedSmallButton: { backgroundColor: colors.accentSoft },
  savedSmallButtonText: { color: colors.accent },
});
