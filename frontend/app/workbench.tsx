import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { api } from '../services/api';
import { colors, radii, shadows } from '../constants/theme';

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
const hasUsablePhone = (phone?: string | null) => (phone || '').replace(/\D/g, '').length >= 10;
const isClientLead = (item: any) => ['buyer', 'tenant'].includes(
  String(item?.lead_type || item?.buyer_type || '').toLowerCase()
);

const dateAfterDays = (days: number) => {
  const next = new Date();
  next.setDate(next.getDate() + days);
  next.setHours(10, 0, 0, 0);
  return next;
};

type ContactChannel = 'Call' | 'WhatsApp';

type PendingContact = {
  channel: ContactChannel;
  leadId?: number;
  actionId?: number;
  phone: string;
  name?: string;
  message?: string;
  source?: string;
  suggestedNextDays?: number;
};

type PendingActionOutcome = {
  leadId?: number;
  actionId?: number;
  leadName?: string;
  channel: ContactChannel | 'Task';
  outcome: 'Connected' | 'WhatsApp Sent' | 'No Answer' | 'Completed';
};

export default function WorkbenchScreen() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingMatchKey, setSavingMatchKey] = useState<string | null>(null);
  const [pendingContact, setPendingContact] = useState<PendingContact | null>(null);
  const [showOutcomeModal, setShowOutcomeModal] = useState(false);
  const [contactOutcome, setContactOutcome] = useState('');
  const [nextFollowupDate, setNextFollowupDate] = useState(dateAfterDays(2));
  const [showNextDatePicker, setShowNextDatePicker] = useState(false);
  const [pendingActionOutcome, setPendingActionOutcome] = useState<PendingActionOutcome | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [createNextAction, setCreateNextAction] = useState(false);
  const [actionNextDate, setActionNextDate] = useState(dateAfterDays(2));
  const [showActionDatePicker, setShowActionDatePicker] = useState(false);
  const appLeftForContact = useRef(false);
  const pendingContactRef = useRef<PendingContact | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const activeContact = pendingContactRef.current;
      if (!activeContact) return;
      if (nextState === 'inactive' || nextState === 'background') {
        appLeftForContact.current = true;
        return;
      }
      if (nextState === 'active' && appLeftForContact.current) {
        appLeftForContact.current = false;
        const defaultOutcome = activeContact.channel === 'Call' ? 'Connected' : 'Message sent';
        setContactOutcome(defaultOutcome);
        setNextFollowupDate(dateAfterDays(activeContact.suggestedNextDays || 2));
        setShowOutcomeModal(true);
      }
    });
    return () => subscription.remove();
  }, []);

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

  const openActionOutcomeModal = (action: PendingActionOutcome, nextDays = 2) => {
    setPendingActionOutcome(action);
    setActionNote('');
    setCreateNextAction(false);
    setActionNextDate(dateAfterDays(nextDays));
    setShowActionDatePicker(false);
  };

  const recordOutcome = (
    leadId: number,
    actionId: number | undefined,
    channel: ContactChannel,
    outcome: 'Connected' | 'WhatsApp Sent' | 'No Answer',
    nextDays: number,
    leadName?: string,
  ) => {
    openActionOutcomeModal({ leadId, actionId, leadName, channel, outcome }, nextDays);
  };

  const closeActionOutcomeModal = () => {
    setPendingActionOutcome(null);
    setActionNote('');
    setCreateNextAction(false);
    setShowActionDatePicker(false);
  };

  const saveActionOutcome = async () => {
    if (!pendingActionOutcome) return;

    const { leadId, actionId, channel, outcome } = pendingActionOutcome;
    const key = `${leadId || 'none'}-${actionId || 'lead'}-${outcome}`;
    const note = actionNote.trim();
    if (!note) {
      Alert.alert('Note Required', 'Please enter a note before completing this action.');
      return;
    }
    const nextAt = createNextAction ? `${isoDate(actionNextDate)}T10:00` : undefined;
    setSavingKey(key);

    try {
      if (leadId) {
        await api.createFollowup(String(leadId), {
          channel,
          outcome,
          notes: note,
          followup_date: isoDate(new Date()),
          next_followup: nextAt,
        });

        if (createNextAction && nextAt) {
          await api.createReminder({
            lead_id: leadId,
            title: `${channel === 'Task' ? 'Follow-up' : channel} follow-up`,
            reminder_date: nextAt,
            reminder_type: channel === 'Task' ? 'Follow-up' : channel,
            notes: note,
            priority: outcome === 'No Answer' ? 'High' : 'Medium',
          });
        }
      }

      if (actionId) {
        await api.updateReminder(String(actionId), {
          status: 'completed',
          outcome: note,
        });
      }

      closeActionOutcomeModal();
      await loadData(true);
    } catch (error: any) {
      await loadData(true);
      Alert.alert('Update Failed', error?.message || 'Could not save action outcome');
    } finally {
      setSavingKey(null);
    }
  };

  const startContact = async (contact: PendingContact) => {
    if (!hasUsablePhone(contact.phone)) {
      Alert.alert('No Phone', 'This lead does not have a contact number.');
      return;
    }

    try {
      pendingContactRef.current = contact;
      setPendingContact(contact);
      appLeftForContact.current = false;
      if (contact.channel === 'Call') {
        await Linking.openURL(`tel:${contact.phone}`);
      } else {
        const cleanPhone = contact.phone.replace(/\D/g, '');
        const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
        const message = contact.message || `Hi ${contact.name || ''}, `;
        await Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`);
      }
    } catch (error: any) {
      pendingContactRef.current = null;
      setPendingContact(null);
      Alert.alert('Contact Failed', error?.message || `Could not open ${contact.channel}`);
    }
  };

  const closeOutcomeModal = () => {
    setShowOutcomeModal(false);
    setShowNextDatePicker(false);
    setContactOutcome('');
    pendingContactRef.current = null;
    setPendingContact(null);
  };

  const selectContactOutcome = (outcome: string) => {
    setContactOutcome(outcome);
    if (outcome === 'No Answer' || outcome === 'Call Back') {
      setNextFollowupDate(dateAfterDays(1));
    } else if (outcome === 'Connected' || outcome === 'Message sent') {
      setNextFollowupDate(dateAfterDays(pendingContact?.suggestedNextDays || 2));
    }
  };

  const saveContactOutcome = async () => {
    if (!pendingContact) return;
    if (!pendingContact.leadId) {
      closeOutcomeModal();
      Alert.alert('Lead Missing', 'This contact is not linked with a lead, so no activity was logged.');
      return;
    }

    if (pendingContact.channel === 'WhatsApp' && contactOutcome === 'Not sent') {
      closeOutcomeModal();
      return;
    }

    const outcome = pendingContact.channel === 'WhatsApp' ? 'WhatsApp Sent' : contactOutcome;
    const needsNextReminder = contactOutcome !== 'Not Interested';
    const nextAt = `${isoDate(nextFollowupDate)}T10:00`;
    const key = `${pendingContact.leadId}-${pendingContact.actionId || 'lead'}-${outcome}`;
    setSavingKey(key);

    try {
      if (pendingContact.channel === 'WhatsApp') {
        await api.sendWhatsApp({
          phone: pendingContact.phone,
          message: pendingContact.message || `Hi ${pendingContact.name || ''}, `,
          lead_id: String(pendingContact.leadId),
          status: 'confirmed_sent',
          source: pendingContact.source || 'ios_workbench',
        });
      }

      await api.createFollowup(String(pendingContact.leadId), {
        channel: pendingContact.channel,
        outcome,
        notes: `${outcome} confirmed from Today Action Center`,
        followup_date: isoDate(new Date()),
        next_followup: needsNextReminder ? nextAt : undefined,
      });

      if (needsNextReminder) {
        await api.createReminder({
          lead_id: pendingContact.leadId,
          title: `${pendingContact.channel} follow-up`,
          reminder_date: nextAt,
          reminder_type: pendingContact.channel,
          notes: `Scheduled after ${outcome}`,
          priority: contactOutcome === 'No Answer' ? 'High' : 'Medium',
        });
      }

      if (pendingContact.actionId) {
        await api.updateReminder(String(pendingContact.actionId), { status: 'completed', outcome });
      }

      closeOutcomeModal();
      await loadData(true);
    } catch (error: any) {
      Alert.alert('Update Failed', error?.message || 'Could not save contact outcome');
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
    await startContact({
      channel: 'WhatsApp',
      leadId: lead.id,
      phone: lead.phone,
      name: lead.name,
      message: lead.suggested_message || `Hi ${lead.name || ''}, `,
      source: 'ios_whatsapp_intelligence',
      suggestedNextDays: Number(lead.suggested_next_followup_days || 2),
    });
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
  const missedActions = (data?.missed_actions || []).filter(isClientLead);
  const todayActions = (data?.today_actions || []).filter(isClientLead);
  const whatsappDue = (data?.whatsapp_due_leads || []).filter(isClientLead);
  const hotLeads = (data?.hot_leads_without_action || []).filter(isClientLead);
  const notesMissing = (data?.notes_missing || []).filter(isClientLead);
  const matches = (data?.smart_matches || []).filter(isClientLead);
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
                onOpen={() => router.push(
                  item.lead_id ? `/leads/${item.lead_id}` as any : `/reminders/edit/${item.id}` as any
                )}
                onDone={() => openActionOutcomeModal({
                  leadId: item.lead_id,
                  actionId: item.id,
                  leadName: item.lead_name || item.title,
                  channel: 'Task',
                  outcome: 'Completed',
                })}
                onOutcome={item.lead_id ? recordOutcome : undefined}
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
              onStartContact={startContact}
            />
          ))}
        </Section>

        <Section title="Notes Missing" empty="No missing-note leads.">
          {notesMissing.map((lead: any) => (
            <LeadCard key={`notes-${lead.id}`} lead={lead} onOutcome={recordOutcome} savingKey={savingKey} />
          ))}
        </Section>
      </ScrollView>

      <Modal
        visible={showOutcomeModal}
        animationType="slide"
        transparent
        onRequestClose={closeOutcomeModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.outcomeModalOverlay}>
            <View style={styles.outcomeModal}>
            <View style={styles.outcomeModalHeader}>
              <View style={styles.outcomeModalTitleRow}>
                <Ionicons
                  name={pendingContact?.channel === 'WhatsApp' ? 'logo-whatsapp' : 'call'}
                  size={20}
                  color={pendingContact?.channel === 'WhatsApp' ? '#25D366' : colors.primary}
                />
                <View>
                  <Text style={styles.outcomeModalTitle}>
                    {pendingContact?.channel === 'WhatsApp' ? 'Was the message sent?' : 'How did the call go?'}
                  </Text>
                  <Text style={styles.outcomeModalSubtitle}>{pendingContact?.name || 'Lead'}</Text>
                </View>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={closeOutcomeModal}>
                <Ionicons name="close" size={20} color={colors.inkMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.outcomeOptions}>
              {(pendingContact?.channel === 'WhatsApp'
                ? ['Message sent', 'Not sent']
                : ['Connected', 'No Answer', 'Call Back', 'Not Interested']
              ).map((outcome) => (
                <TouchableOpacity
                  key={outcome}
                  style={[styles.outcomeOption, contactOutcome === outcome && styles.outcomeOptionActive]}
                  onPress={() => selectContactOutcome(outcome)}
                >
                  <Text style={[styles.outcomeOptionText, contactOutcome === outcome && styles.outcomeOptionTextActive]}>
                    {outcome}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {contactOutcome !== 'Not sent' && contactOutcome !== 'Not Interested' ? (
              <View style={styles.nextFollowupPanel}>
                <Text style={styles.nextFollowupLabel}>Next follow-up date</Text>
                <TouchableOpacity
                  style={styles.nextFollowupDateButton}
                  onPress={() => setShowNextDatePicker((current) => !current)}
                >
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  <Text style={styles.nextFollowupDateText}>
                    {nextFollowupDate.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={colors.inkMuted} />
                </TouchableOpacity>

                <View style={styles.datePresetRow}>
                  {[1, 2, 3, 7].map((days) => (
                    <TouchableOpacity
                      key={days}
                      style={styles.datePresetButton}
                      onPress={() => setNextFollowupDate(dateAfterDays(days))}
                    >
                      <Text style={styles.datePresetText}>{days === 1 ? 'Tomorrow' : `${days} days`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {showNextDatePicker ? (
                  <View style={styles.datePickerWrap}>
                    <DateTimePicker
                      value={nextFollowupDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      minimumDate={new Date()}
                      onChange={(_, selectedDate) => {
                        if (Platform.OS !== 'ios') setShowNextDatePicker(false);
                        if (selectedDate) {
                          selectedDate.setHours(10, 0, 0, 0);
                          setNextFollowupDate(selectedDate);
                        }
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.noLogHint}>
                {contactOutcome === 'Not sent'
                  ? 'No WhatsApp activity or reminder will be created.'
                  : 'The call will be logged and the current action closed without creating another reminder.'}
              </Text>
            )}

            <TouchableOpacity
              style={[styles.saveOutcomeButton, savingKey && styles.saveOutcomeButtonDisabled]}
              onPress={saveContactOutcome}
              disabled={Boolean(savingKey)}
            >
              {savingKey ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="checkmark" size={18} color={colors.white} />
              )}
              <Text style={styles.saveOutcomeButtonText}>
                {contactOutcome === 'Not sent' ? 'Close without logging' : 'Save outcome'}
              </Text>
            </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <Modal
        visible={Boolean(pendingActionOutcome)}
        animationType="slide"
        transparent
        onRequestClose={closeActionOutcomeModal}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.outcomeModalOverlay}>
            <View style={styles.outcomeModal}>
            <View style={styles.outcomeModalHeader}>
              <View style={styles.outcomeModalTitleRow}>
                <Ionicons name="checkmark-circle-outline" size={22} color={colors.primary} />
                <View>
                  <Text style={styles.outcomeModalTitle}>
                    {pendingActionOutcome?.outcome || 'Complete action'}
                  </Text>
                  <Text style={styles.outcomeModalSubtitle}>
                    {pendingActionOutcome?.leadName || 'Add details before saving'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.modalCloseButton} onPress={closeActionOutcomeModal}>
                <Ionicons name="close" size={20} color={colors.inkMuted} />
              </TouchableOpacity>
            </View>

            <Text style={styles.nextFollowupLabel}>Note</Text>
            <TextInput
              style={styles.actionNoteInput}
              value={actionNote}
              onChangeText={setActionNote}
              placeholder="What happened?"
              placeholderTextColor={colors.inkSubtle}
              multiline
              textAlignVertical="top"
            />

            {pendingActionOutcome?.leadId ? (
              <View style={styles.optionalFollowupPanel}>
                <TouchableOpacity
                  style={styles.optionalFollowupToggle}
                  onPress={() => {
                    setCreateNextAction((current) => !current);
                    setShowActionDatePicker(false);
                  }}
                >
                  <Ionicons
                    name={createNextAction ? 'checkbox' : 'square-outline'}
                    size={22}
                    color={createNextAction ? colors.primary : colors.inkMuted}
                  />
                  <View style={styles.optionalFollowupCopy}>
                    <Text style={styles.optionalFollowupTitle}>Create next follow-up</Text>
                    <Text style={styles.optionalFollowupHint}>Optional — no reminder is created unless selected.</Text>
                  </View>
                </TouchableOpacity>

                {createNextAction ? (
                  <View style={styles.nextFollowupPanel}>
                    <TouchableOpacity
                      style={styles.nextFollowupDateButton}
                      onPress={() => setShowActionDatePicker((current) => !current)}
                    >
                      <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                      <Text style={styles.nextFollowupDateText}>
                        {actionNextDate.toLocaleDateString('en-IN', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={colors.inkMuted} />
                    </TouchableOpacity>

                    <View style={styles.datePresetRow}>
                      {[1, 2, 3, 7].map((days) => (
                        <TouchableOpacity
                          key={days}
                          style={styles.datePresetButton}
                          onPress={() => setActionNextDate(dateAfterDays(days))}
                        >
                          <Text style={styles.datePresetText}>{days === 1 ? 'Tomorrow' : `${days} days`}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {showActionDatePicker ? (
                      <View style={styles.datePickerWrap}>
                        <DateTimePicker
                          value={actionNextDate}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'inline' : 'default'}
                          minimumDate={new Date()}
                          onChange={(_, selectedDate) => {
                            if (Platform.OS !== 'ios') setShowActionDatePicker(false);
                            if (selectedDate) {
                              selectedDate.setHours(10, 0, 0, 0);
                              setActionNextDate(selectedDate);
                            }
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.noLogHint}>
                This action is not linked to a lead, so it can be completed but a next follow-up cannot be created.
              </Text>
            )}

            <TouchableOpacity
              style={[styles.saveOutcomeButton, savingKey && styles.saveOutcomeButtonDisabled]}
              onPress={saveActionOutcome}
              disabled={Boolean(savingKey)}
            >
              {savingKey ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="checkmark" size={18} color={colors.white} />
              )}
              <Text style={styles.saveOutcomeButtonText}>
                {createNextAction ? 'Save and create follow-up' : 'Save and complete'}
              </Text>
            </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  onOutcome?: OutcomeHandler;
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

function MatchCard({
  match,
  saving,
  onSave,
  onStartContact,
}: {
  match: any;
  saving: boolean;
  onSave: () => void;
  onStartContact: (contact: PendingContact) => Promise<void>;
}) {
  const buyerBudget = [formatCr(match.buyer_budget_min), formatCr(match.buyer_budget_max)].filter(Boolean).join(' - ');
  const inventoryPrice = [formatCr(match.inventory_price_min), formatCr(match.inventory_price_max)].filter(Boolean).join(' - ');
  const reasons = Array.isArray(match.match_reasons) ? match.match_reasons : [];
  const usableBuyerPhone = hasUsablePhone(match.buyer_phone);

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
        <TouchableOpacity
          style={styles.iconAction}
          onPress={() => onStartContact({
            channel: 'Call',
            leadId: match.buyer_id,
            phone: match.buyer_phone,
            name: match.buyer_name,
            suggestedNextDays: 2,
          })}
          disabled={!usableBuyerPhone}
        >
          <Ionicons name="call" size={17} color={usableBuyerPhone ? colors.accent : colors.inkSubtle} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconAction}
          onPress={() => onStartContact({
            channel: 'WhatsApp',
            leadId: match.buyer_id,
            phone: match.buyer_phone,
            name: match.buyer_name,
            suggestedNextDays: 2,
          })}
          disabled={!usableBuyerPhone}
        >
          <Ionicons name="logo-whatsapp" size={17} color={usableBuyerPhone ? '#25D366' : colors.inkSubtle} />
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
  leadId: number,
  actionId: number | undefined,
  channel: ContactChannel,
  outcome: 'Connected' | 'WhatsApp Sent' | 'No Answer',
  nextDays: number,
  leadName?: string,
) => void;

function ActionRow({
  leadId,
  actionId,
  phone,
  name,
  onOpen,
  onDone,
  onCall,
  onWhatsApp,
  onOutcome,
  savingKey,
  doneLabel = 'Done',
}: {
  leadId?: number;
  actionId?: number;
  phone?: string;
  name?: string;
  onOpen: () => void;
  onDone: () => void;
  onCall?: () => void;
  onWhatsApp?: () => void;
  onOutcome?: OutcomeHandler;
  savingKey?: string | null;
  doneLabel?: string;
}) {
  const usablePhone = hasUsablePhone(phone);
  const isSaving = (outcome: string) => savingKey === `${leadId}-${actionId || 'lead'}-${outcome}`;
  const openUntrackedWhatsApp = () => {
    if (!phone) return;
    const cleanPhone = phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(`Hi ${name || ''}, `)}`);
  };

  return (
    <View style={styles.actions}>
      <TouchableOpacity style={styles.iconAction} onPress={onCall || (() => usablePhone && Linking.openURL(`tel:${phone}`))} disabled={!usablePhone}>
        <Ionicons name="call" size={17} color={usablePhone ? colors.accent : colors.inkSubtle} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.iconAction} onPress={onWhatsApp || openUntrackedWhatsApp} disabled={!usablePhone}>
        <Ionicons name="logo-whatsapp" size={17} color={usablePhone ? '#25D366' : colors.inkSubtle} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.smallButton} onPress={onOpen}>
        <Ionicons name="open-outline" size={16} color={colors.primary} />
        <Text style={styles.smallButtonText}>Open</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.smallButton, styles.primarySmallButton]} onPress={onDone}>
        <Text style={styles.primarySmallButtonText}>{doneLabel}</Text>
      </TouchableOpacity>
      {onOutcome && leadId ? (
        <View style={styles.quickOutcomes}>
          <TouchableOpacity
            style={styles.outcomeButton}
            onPress={() => onOutcome(leadId, actionId, 'Call', 'Connected', 2, name)}
            disabled={isSaving('Connected')}
          >
            <Text style={styles.outcomeButtonText}>{isSaving('Connected') ? 'Saving...' : 'Call done'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outcomeButton}
            onPress={() => onOutcome(leadId, actionId, 'WhatsApp', 'WhatsApp Sent', 2, name)}
            disabled={isSaving('WhatsApp Sent')}
          >
            <Text style={styles.outcomeButtonText}>{isSaving('WhatsApp Sent') ? 'Saving...' : 'WA sent'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.outcomeButton, styles.noAnswerButton]}
            onPress={() => onOutcome(leadId, actionId, 'Call', 'No Answer', 1, name)}
            disabled={isSaving('No Answer')}
          >
            <Text style={[styles.outcomeButtonText, styles.noAnswerText]}>
              {isSaving('No Answer') ? 'Saving...' : 'No answer'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
  outcomeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.48)',
    justifyContent: 'flex-end',
  },
  outcomeModal: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 18,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  outcomeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
  },
  outcomeModalTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  outcomeModalTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.ink,
  },
  outcomeModalSubtitle: {
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 2,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  outcomeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  outcomeOption: {
    minHeight: 40,
    paddingHorizontal: 13,
    borderRadius: 8,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeOptionActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  outcomeOptionText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  outcomeOptionTextActive: {
    color: colors.primary,
  },
  actionNoteInput: {
    minHeight: 92,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  optionalFollowupPanel: {
    marginBottom: 18,
  },
  optionalFollowupToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 12,
  },
  optionalFollowupCopy: {
    flex: 1,
  },
  optionalFollowupTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.ink,
  },
  optionalFollowupHint: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.inkMuted,
    marginTop: 2,
  },
  nextFollowupPanel: {
    marginTop: 12,
    marginBottom: 18,
  },
  nextFollowupLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 7,
  },
  nextFollowupDateButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
  },
  nextFollowupDateText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  datePresetRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 9,
    flexWrap: 'wrap',
  },
  datePresetButton: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePresetText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: '800',
  },
  datePickerWrap: {
    marginTop: 8,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  noLogHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.inkMuted,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 8,
    padding: 12,
    marginBottom: 18,
  },
  saveOutcomeButton: {
    minHeight: 46,
    borderRadius: 9,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  saveOutcomeButtonDisabled: {
    opacity: 0.65,
  },
  saveOutcomeButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '900',
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
