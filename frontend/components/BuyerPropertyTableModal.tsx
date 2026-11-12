import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Lead } from '../constants/leadOptions';
import { api } from '../services/api';

const columns = [95, 165, 140, 240, 110, 120, 200];
const headings = ['Lead ID', 'Name', 'Preferred / Shared', 'Address + Location', 'Size', 'Floor', 'Price'];

export default function BuyerPropertyTableModal({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setProperties([]);
    setError('');
    if (!lead) return () => { active = false; };
    setLoading(true);
    api.getLead(String(lead.id), { forceNetwork: true }).then((detail) => {
      if (!active) return;
      const unique = new Map<number, any>();
      (detail.matched_properties || []).forEach((property: any) => unique.set(property.property_id || property.id, property));
      setProperties(Array.from(unique.values()));
    }).catch(() => {
      if (active) setError('Unable to load properties. Check your connection and try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [lead?.id, attempt]);

  const priceLabel = (property: any) => {
    const unit = property.property_unit || 'CR';
    if (property.floor_pricing?.length) return property.floor_pricing.map((price: any) =>
      `${price.floor_label}: ${price.floor_amount == null || price.floor_amount === '' ? 'Price not set' : `₹${price.floor_amount} ${unit}`}`
    ).join('\n');
    const min = property.property_budget_min;
    const max = property.property_budget_max;
    const amount = min && max && Number(min) !== Number(max) ? `${min} – ${max}` : max || min;
    return amount ? `₹${amount} ${unit}` : 'Price not set';
  };

  return (
    <Modal visible={!!lead} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Preferred / Shared Properties</Text>
            <Text style={styles.subtitle}>{lead?.name}{!loading && !error ? ` · ${properties.length} properties` : ''}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close properties">
            <Ionicons name="close" size={23} color="#334155" />
          </TouchableOpacity>
        </View>
        {loading ? <View style={styles.center}><ActivityIndicator color="#2563EB" /><Text style={styles.hint}>Loading properties…</Text></View>
          : error ? <View style={styles.center}><Text style={styles.hint}>{error}</Text><TouchableOpacity onPress={() => setAttempt(value => value + 1)}><Text style={styles.retry}>Try again</Text></TouchableOpacity></View>
          : !properties.length ? <View style={styles.center}><Ionicons name="home-outline" size={35} color="#94A3B8" /><Text style={styles.hint}>No preferred or shared properties found.</Text></View>
          : <>
            <Text style={styles.scrollHint}>Swipe sideways to view all columns →</Text>
            <ScrollView horizontal style={{ flex: 1 }}>
              <View style={{ width: columns.reduce((sum, width) => sum + width, 0), flex: 1 }}>
                <View style={[styles.row, styles.tableHeader]}>{headings.map((heading, index) => <Text key={heading} style={[styles.cell, styles.columnTitle, { width: columns[index] }]}>{heading}</Text>)}</View>
                <ScrollView>
                  {properties.map((property, index) => {
                    const address = [property.property_address, property.property_location].filter((value, i, all) => value && all.indexOf(value) === i).join(', ');
                    const relationship = property.is_shared ? (property.match_id ? 'Preferred / Shared' : 'Shared') : 'Preferred';
                    const cells = [`#${property.property_id || property.id}`, property.property_name, relationship, address, property.property_size ? `${property.property_size} sq yds` : '', property.property_floor, priceLabel(property)];
                    return <View key={property.property_id || property.id} style={[styles.row, index % 2 === 1 && styles.alternate]}>{cells.map((value, col) => <Text key={col} style={[styles.cell, { width: columns[col] }, col === 0 && styles.id]}>{String(value || '—')}</Text>)}</View>;
                  })}
                </ScrollView>
              </View>
            </ScrollView>
          </>}
      </SafeAreaView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  title: { fontSize: 18, fontWeight: '700', color: '#18334D' },
  subtitle: { fontSize: 12, color: '#64748B', marginTop: 5 },
  close: { padding: 9, borderRadius: 20, backgroundColor: '#F1F5F9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  hint: { fontSize: 14, color: '#64748B', textAlign: 'center' },
  retry: { color: '#2563EB', padding: 12, fontWeight: '600' },
  scrollHint: { fontSize: 11, color: '#64748B', paddingHorizontal: 20, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tableHeader: { backgroundColor: '#EEF4FA' },
  columnTitle: { fontWeight: '700', color: '#18334D' },
  cell: { padding: 14, fontSize: 12, lineHeight: 20, color: '#334155' },
  alternate: { backgroundColor: '#F8FAFC' },
  id: { color: '#2563EB', fontWeight: '600' },
});
