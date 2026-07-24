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

export default function CollaborationInboxScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [respondingId, setRespondingId] = useState<number | null>(null);

  const loadInbox = async () => {
    try {
      const result = await api.getCollaborationInbox();
      setItems(Array.isArray(result?.items) ? result.items : []);
      setUnread(Number(result?.unread || 0));
    } catch (error: any) {
      Alert.alert('Team Inbox', error?.message || 'Unable to load collaboration updates.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadInbox();
    }, [])
  );

  const markAllRead = async () => {
    try {
      await api.markCollaborationInboxRead();
      setUnread(0);
      setItems((current) => current.map((item) => ({ ...item, is_read: 1 })));
    } catch (error: any) {
      Alert.alert('Update Failed', error?.message || 'Could not mark notifications read.');
    }
  };

  const respond = async (item: any, decision: 'accepted' | 'declined') => {
    setRespondingId(item.reference_id);
    try {
      await api.respondToLeadHandoff(item.reference_id, decision);
      await loadInbox();
      if (decision === 'accepted' && item.lead_id) {
        Alert.alert('Handoff Accepted', 'This lead is now assigned to you.', [
          { text: 'Open Lead', onPress: () => router.push(`/leads/${item.lead_id}` as any) },
          { text: 'OK' },
        ]);
      }
    } catch (error: any) {
      Alert.alert('Handoff Failed', error?.message || 'Could not update the handoff.');
    } finally {
      setRespondingId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading team inbox...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Team Inbox</Text>
          <Text style={styles.subtitle}>{unread ? `${unread} update${unread === 1 ? '' : 's'} need attention` : 'You are all caught up'}</Text>
        </View>
        {unread > 0 ? (
          <TouchableOpacity style={styles.readButton} onPress={markAllRead}>
            <Ionicons name="checkmark-done" size={18} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.readButton} onPress={loadInbox}>
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadInbox();
            }}
          />
        }
      >
        {items.length ? items.map((item) => {
          const isHandoff = item.notification_type === 'handoff';
          const isPendingHandoff = isHandoff && item.handoff_status === 'pending';
          const isResponding = respondingId === item.reference_id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, !item.is_read && styles.unreadCard]}
              activeOpacity={0.78}
              onPress={() => item.lead_id && router.push(`/leads/${item.lead_id}` as any)}
            >
              <View style={[
                styles.iconWrap,
                { backgroundColor: isHandoff ? colors.purpleSoft : colors.amberSoft },
              ]}>
                <Ionicons
                  name={isHandoff ? 'people-outline' : 'at-outline'}
                  size={20}
                  color={isHandoff ? colors.purple : colors.amber}
                />
              </View>
              <View style={styles.cardCopy}>
                <View style={styles.cardTop}>
                  <Text style={styles.leadName} numberOfLines={1}>{item.lead_name || `Lead #${item.lead_id}`}</Text>
                  {!item.is_read ? <View style={styles.unreadDot} /> : null}
                </View>
                <Text style={styles.message}>{item.message}</Text>
                <Text style={styles.time}>{formatDate(item.created_at)}</Text>

                {isPendingHandoff ? (
                  <View style={styles.handoffActions}>
                    <TouchableOpacity
                      style={[styles.handoffButton, styles.declineButton]}
                      onPress={(event) => {
                        event.stopPropagation();
                        respond(item, 'declined');
                      }}
                      disabled={isResponding}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.handoffButton, styles.acceptButton]}
                      onPress={(event) => {
                        event.stopPropagation();
                        respond(item, 'accepted');
                      }}
                      disabled={isResponding}
                    >
                      {isResponding ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text style={styles.acceptText}>Accept handoff</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }) : (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="checkmark-circle" size={34} color={colors.accent} />
            </View>
            <Text style={styles.emptyTitle}>Team inbox is clear</Text>
            <Text style={styles.emptyText}>Mentions and lead handoff requests will appear here.</Text>
          </View>
        )}
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
  readButton: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  content: { padding: 16, paddingBottom: 36 },
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  unreadCard: { borderColor: '#E6C879', backgroundColor: '#FFFCF3' },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCopy: { flex: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leadName: { flex: 1, fontSize: 15, fontWeight: '900', color: colors.ink },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.amber },
  message: { fontSize: 13, lineHeight: 19, color: colors.inkMuted, marginTop: 4 },
  time: { fontSize: 11, color: colors.inkSubtle, marginTop: 7 },
  handoffActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  handoffButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: { backgroundColor: colors.dangerSoft },
  acceptButton: { backgroundColor: colors.primary },
  declineText: { color: colors.danger, fontWeight: '800', fontSize: 12 },
  acceptText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  emptyCard: {
    alignItems: 'center',
    padding: 30,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentSoft,
  },
  emptyTitle: { marginTop: 14, fontSize: 17, fontWeight: '900', color: colors.ink },
  emptyText: { marginTop: 5, textAlign: 'center', fontSize: 13, lineHeight: 19, color: colors.inkMuted },
});
