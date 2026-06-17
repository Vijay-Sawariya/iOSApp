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

const openWhatsApp = async (phone?: string, name?: string, leadId?: number) => {
  if (!phone) return;
  const cleanPhone = phone.replace(/\D/g, '');
  const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
  const message = `Hi ${name || ''}, `;
  await api.sendWhatsApp({
    phone,
    message,
    lead_id: leadId ? String(leadId) : undefined,
    status: 'opened',
    source: 'ios_assigned',
  }).catch((error) => console.warn('WhatsApp log failed:', error));
  Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`);
};

export default function AssignedLeadsScreen() {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async (force = false) => {
    try {
      const result = await api.getAssignedLeads(force ? { forceNetwork: true } : undefined);
      setLeads(Array.isArray(result) ? result : []);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load assigned leads');
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

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading assigned leads...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Assigned Leads</Text>
          <Text style={styles.subtitle}>{leads.length} leads ready for action</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {leads.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="person-circle-outline" size={28} color={colors.inkSubtle} />
            <Text style={styles.emptyTitle}>No assigned leads</Text>
            <Text style={styles.emptyText}>Assigned buyer, tenant, seller, and inventory leads will appear here.</Text>
          </View>
        ) : (
          leads.map((lead) => (
            <View key={lead.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{lead.name || 'Lead'}</Text>
                  <Text style={styles.cardMeta}>{lead.lead_type || 'lead'} · {lead.location || 'Location n/a'}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>{lead.lead_temperature || lead.lead_status || 'Open'}</Text>
                </View>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="person-outline" size={14} color={colors.inkMuted} />
                <Text style={styles.detailText}>Assigned to {lead.assigned_to_name || 'team member'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Ionicons name="home-outline" size={14} color={colors.inkMuted} />
                <Text style={styles.detailText} numberOfLines={1}>{lead.bhk || lead.floor || lead.area_size || 'Requirement details pending'}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.iconAction} onPress={() => callPhone(lead.phone)} disabled={!lead.phone}>
                  <Ionicons name="call" size={17} color={lead.phone ? colors.accent : colors.inkSubtle} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconAction} onPress={() => openWhatsApp(lead.phone, lead.name, lead.id)} disabled={!lead.phone}>
                  <Ionicons name="logo-whatsapp" size={17} color={lead.phone ? '#25D366' : colors.inkSubtle} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallButton} onPress={() => router.push(`/leads/${lead.id}` as any)}>
                  <Ionicons name="open-outline" size={16} color={colors.primary} />
                  <Text style={styles.smallButtonText}>Open</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.smallButton, styles.primarySmallButton]}
                  onPress={() => router.push(`/reminders/add?lead_id=${lead.id}&lead_name=${encodeURIComponent(lead.name || '')}` as any)}
                >
                  <Text style={styles.primarySmallButtonText}>Reminder</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
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
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  badge: { maxWidth: 90, backgroundColor: colors.primarySoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.pill },
  badgeText: { color: colors.primary, fontSize: 11, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  detailText: { flex: 1, fontSize: 12, color: colors.inkMuted },
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
