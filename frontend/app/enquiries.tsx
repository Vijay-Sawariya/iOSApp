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

export default function EnquiriesScreen() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [convertingId, setConvertingId] = useState<number | null>(null);

  const loadData = async (force = false) => {
    try {
      const response = await api.getEnquiries(force ? { forceRefresh: true } : undefined);
      setItems(Array.isArray(response?.items) ? response.items : []);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to load enquiries');
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

  const convert = async (item: any) => {
    setConvertingId(item.id);
    try {
      const result = await api.convertEnquiry(item.id);
      Alert.alert('Converted', `${item.name || 'Enquiry'} is now a buyer lead`, [
        { text: 'Open Lead', onPress: () => router.push(`/leads/${result.lead_id}` as any) },
        { text: 'OK' },
      ]);
      loadData(true);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to convert enquiry');
    } finally {
      setConvertingId(null);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Loading enquiries...</Text>
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
          <Text style={styles.title}>Enquiries</Text>
          <Text style={styles.subtitle}>{items.length} fresh advertisement enquiries</Text>
        </View>
        <TouchableOpacity style={styles.iconButton} onPress={onRefresh}>
          <Ionicons name="refresh" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={28} color={colors.inkSubtle} />
            <Text style={styles.emptyTitle}>No fresh enquiries</Text>
            <Text style={styles.emptyText}>New advertisement enquiries will appear here for call, WhatsApp, and conversion.</Text>
          </View>
        ) : (
          items.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={styles.cardTitle}>{item.name || 'New enquiry'}</Text>
                  <Text style={styles.cardMeta}>{item.source || 'Advertisement'} · {item.location || 'Location n/a'}</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.status || 'New'}</Text>
                </View>
              </View>
              <Text style={styles.notes} numberOfLines={3}>{item.notes || 'No message captured yet'}</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.iconAction} onPress={() => callPhone(item.phone)} disabled={!item.phone}>
                  <Ionicons name="call" size={17} color={item.phone ? colors.accent : colors.inkSubtle} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconAction} onPress={() => openWhatsApp(item.phone, item.name)} disabled={!item.phone}>
                  <Ionicons name="logo-whatsapp" size={17} color={item.phone ? '#25D366' : colors.inkSubtle} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.convertButton, convertingId === item.id && styles.disabled]}
                  onPress={() => convert(item)}
                  disabled={convertingId === item.id}
                >
                  {convertingId === item.id ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Ionicons name="swap-horizontal" size={16} color={colors.white} />
                      <Text style={styles.convertButtonText}>Convert</Text>
                    </>
                  )}
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
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardCopy: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cardMeta: { fontSize: 12, color: colors.inkMuted, marginTop: 3 },
  badge: { backgroundColor: colors.accentSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.pill },
  badgeText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
  notes: { fontSize: 13, color: colors.inkMuted, marginTop: 10, lineHeight: 19 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  convertButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  convertButtonText: { color: colors.white, fontWeight: '800', fontSize: 12 },
  disabled: { opacity: 0.6 },
});
