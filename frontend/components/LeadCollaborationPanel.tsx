import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { colors, radii } from '../constants/theme';

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export default function LeadCollaborationPanel({ leadId }: { leadId: string | number }) {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState('');
  const [mentionIds, setMentionIds] = useState<number[]>([]);
  const [showPeople, setShowPeople] = useState(false);
  const [showHandoff, setShowHandoff] = useState(false);
  const [handoffUserId, setHandoffUserId] = useState<number | null>(null);
  const [handoffNote, setHandoffNote] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await api.getLeadCollaboration(leadId);
      setData(result);
    } catch (error: any) {
      console.log('Lead collaboration unavailable:', error?.message || error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleMention = (id: number) => {
    setMentionIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  };

  const submitComment = async () => {
    const body = comment.trim();
    if (!body) {
      Alert.alert('Note Required', 'Enter an internal note for the team.');
      return;
    }
    setSaving(true);
    try {
      await api.addLeadComment(leadId, body, mentionIds);
      setComment('');
      setMentionIds([]);
      setShowPeople(false);
      Keyboard.dismiss();
      await load();
    } catch (error: any) {
      Alert.alert('Comment Failed', error?.message || 'Could not add the internal note.');
    } finally {
      setSaving(false);
    }
  };

  const requestHandoff = async () => {
    if (!handoffUserId) {
      Alert.alert('Select Teammate', 'Choose who should receive this lead.');
      return;
    }
    if (!handoffNote.trim()) {
      Alert.alert('Handoff Note', 'Add a short context note for the next owner.');
      return;
    }
    setSaving(true);
    try {
      await api.requestLeadHandoff(leadId, handoffUserId, handoffNote.trim());
      setShowHandoff(false);
      setHandoffUserId(null);
      setHandoffNote('');
      await load();
      Alert.alert('Handoff Sent', 'Ownership will change after the teammate accepts.');
    } catch (error: any) {
      Alert.alert('Handoff Failed', error?.message || 'Could not request the handoff.');
    } finally {
      setSaving(false);
    }
  };

  const respond = async (handoffId: number, decision: 'accepted' | 'declined') => {
    setSaving(true);
    try {
      await api.respondToLeadHandoff(handoffId, decision);
      await load();
      Alert.alert('Handoff Updated', `The handoff was ${decision}.`);
    } catch (error: any) {
      Alert.alert('Handoff Failed', error?.message || 'Could not update the handoff.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Loading team collaboration...</Text>
      </View>
    );
  }

  if (!data) return null;

  const users = Array.isArray(data.users)
    ? data.users.filter((item: any) => String(item.id) !== String(data.current_user_id))
    : [];
  const canRequestHandoff =
    String(data?.owner?.id) === String(user?.id) ||
    ['admin', 'manager'].includes(String(user?.role || '').toLowerCase());
  const pendingForMe = (data.handoffs || []).filter(
    (item: any) => item.status === 'pending' && String(item.to_user_id) === String(data.current_user_id)
  );

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Team Collaboration</Text>
          <Text style={styles.subtitle}>
            Owner: {data?.owner?.full_name || data?.owner?.username || 'Unassigned'}
          </Text>
        </View>
        {canRequestHandoff ? (
          <TouchableOpacity style={styles.handoffTopButton} onPress={() => setShowHandoff(true)}>
            <Ionicons name="people-outline" size={16} color={colors.purple} />
            <Text style={styles.handoffTopText}>Handoff</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {pendingForMe.map((handoff: any) => (
        <View key={handoff.id} style={styles.pendingHandoff}>
          <View style={styles.pendingHeader}>
            <Ionicons name="swap-horizontal" size={19} color={colors.purple} />
            <Text style={styles.pendingTitle}>Handoff requested to you</Text>
          </View>
          {handoff.note ? <Text style={styles.pendingNote}>{handoff.note}</Text> : null}
          <View style={styles.pendingActions}>
            <TouchableOpacity
              style={[styles.responseButton, styles.declineButton]}
              onPress={() => respond(handoff.id, 'declined')}
              disabled={saving}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.responseButton, styles.acceptButton]}
              onPress={() => respond(handoff.id, 'accepted')}
              disabled={saving}
            >
              <Text style={styles.acceptText}>Accept ownership</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <TextInput
        style={styles.input}
        value={comment}
        onChangeText={setComment}
        placeholder="Add an internal note..."
        placeholderTextColor={colors.inkSubtle}
        multiline
        textAlignVertical="top"
      />

      <View style={styles.composerActions}>
        <TouchableOpacity style={styles.mentionButton} onPress={() => setShowPeople((current) => !current)}>
          <Ionicons name="at" size={16} color={colors.amber} />
          <Text style={styles.mentionText}>
            {mentionIds.length ? `${mentionIds.length} mentioned` : 'Mention teammate'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.postButton, saving && styles.disabled]}
          onPress={submitComment}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="send" size={15} color={colors.white} />}
          <Text style={styles.postText}>Post</Text>
        </TouchableOpacity>
      </View>

      {showPeople ? (
        <View style={styles.peopleWrap}>
          {users.map((person: any) => {
            const selected = mentionIds.includes(person.id);
            return (
              <TouchableOpacity
                key={person.id}
                style={[styles.personChip, selected && styles.personChipSelected]}
                onPress={() => toggleMention(person.id)}
              >
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'person-circle-outline'}
                  size={15}
                  color={selected ? colors.primary : colors.inkMuted}
                />
                <Text style={[styles.personText, selected && styles.personTextSelected]}>
                  {person.full_name || person.username}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View style={styles.divider} />
      <Text style={styles.feedTitle}>Internal notes</Text>
      {(data.comments || []).length ? (data.comments || []).slice(0, 8).map((item: any) => (
        <View key={item.id} style={styles.commentCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{String(item.author_name || 'T').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.commentCopy}>
            <View style={styles.commentTop}>
              <Text style={styles.author}>{item.author_name || 'Teammate'}</Text>
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>
            <Text style={styles.body}>{item.body}</Text>
            {Array.isArray(item.mentions) && item.mentions.length ? (
              <Text style={styles.mentions}>
                Mentioned: {item.mentions.map((mention: any) => mention.full_name).join(', ')}
              </Text>
            ) : null}
          </View>
        </View>
      )) : (
        <Text style={styles.empty}>No internal notes yet.</Text>
      )}

      <Modal visible={showHandoff} transparent animationType="slide" onRequestClose={() => setShowHandoff(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Request lead handoff</Text>
                  <Text style={styles.modalSubtitle}>Ownership changes only after acceptance.</Text>
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={() => setShowHandoff(false)}>
                  <Ionicons name="close" size={20} color={colors.inkMuted} />
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>New owner</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ownerRow}>
                {users.map((person: any) => (
                  <TouchableOpacity
                    key={person.id}
                    style={[styles.ownerChip, handoffUserId === person.id && styles.ownerChipSelected]}
                    onPress={() => setHandoffUserId(person.id)}
                  >
                    <Text style={[styles.ownerText, handoffUserId === person.id && styles.ownerTextSelected]}>
                      {person.full_name || person.username}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>Context note</Text>
              <TextInput
                style={styles.handoffInput}
                value={handoffNote}
                onChangeText={setHandoffNote}
                placeholder="What should the next owner know?"
                placeholderTextColor={colors.inkSubtle}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.sendHandoffButton, saving && styles.disabled]}
                onPress={requestHandoff}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color={colors.white} /> : <Ionicons name="paper-plane" size={17} color={colors.white} />}
                <Text style={styles.sendHandoffText}>Send handoff request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surfaceRaised,
    padding: 16,
    marginTop: 12,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceRaised,
    padding: 16,
    marginTop: 12,
  },
  loadingText: { fontSize: 13, color: colors.inkMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 12, color: colors.inkMuted, marginTop: 2 },
  handoffTopButton: {
    minHeight: 36,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.purpleSoft,
  },
  handoffTopText: { fontSize: 12, fontWeight: '800', color: colors.purple },
  pendingHandoff: {
    marginTop: 14,
    borderRadius: radii.md,
    padding: 12,
    backgroundColor: colors.purpleSoft,
    borderWidth: 1,
    borderColor: '#D8D0FF',
  },
  pendingHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pendingTitle: { fontSize: 13, fontWeight: '900', color: colors.purple },
  pendingNote: { fontSize: 12, lineHeight: 18, color: colors.inkMuted, marginTop: 7 },
  pendingActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  responseButton: { flex: 1, minHeight: 36, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  declineButton: { backgroundColor: colors.surfaceRaised },
  acceptButton: { backgroundColor: colors.purple },
  declineText: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  acceptText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  input: {
    minHeight: 82,
    marginTop: 14,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
    padding: 11,
  },
  composerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 9 },
  mentionButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 5 },
  mentionText: { fontSize: 12, fontWeight: '800', color: colors.amber },
  postButton: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
  },
  postText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.6 },
  peopleWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9 },
  personChip: {
    minHeight: 32,
    paddingHorizontal: 9,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  personChipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  personText: { fontSize: 11, color: colors.inkMuted, fontWeight: '700' },
  personTextSelected: { color: colors.primary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  feedTitle: { fontSize: 14, fontWeight: '900', color: colors.ink, marginBottom: 10 },
  commentCard: { flexDirection: 'row', gap: 9, marginBottom: 13 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  avatarText: { fontSize: 12, fontWeight: '900', color: colors.primary },
  commentCopy: { flex: 1 },
  commentTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  author: { fontSize: 12, fontWeight: '900', color: colors.ink },
  date: { fontSize: 10, color: colors.inkSubtle },
  body: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, marginTop: 3 },
  mentions: { fontSize: 10, color: colors.amber, fontWeight: '700', marginTop: 4 },
  empty: { fontSize: 12, color: colors.inkMuted },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15, 23, 42, 0.5)' },
  modalCard: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: 18,
    paddingBottom: 30,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  modalSubtitle: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  fieldLabel: { fontSize: 12, fontWeight: '900', color: colors.ink, marginBottom: 7 },
  ownerRow: { gap: 7, paddingBottom: 16 },
  ownerChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ownerChipSelected: { backgroundColor: colors.purpleSoft, borderColor: colors.purple },
  ownerText: { fontSize: 12, fontWeight: '800', color: colors.inkMuted },
  ownerTextSelected: { color: colors.purple },
  handoffInput: {
    minHeight: 90,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: 11,
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20,
  },
  sendHandoffButton: {
    minHeight: 46,
    borderRadius: radii.md,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: colors.purple,
  },
  sendHandoffText: { color: colors.white, fontSize: 13, fontWeight: '900' },
});
