import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';

type Snapshot = { floors: string[]; prices: { floor_label: string; floor_amount: string | number }[]; property_price: string | number | null; unit: string; inventory_version: string; entire_sold: boolean; can_edit_prices: boolean };
type Row = { label: string; price: string; sold: boolean };
export default function InventoryUpdateModal({ leadId, onClose, onSaved }: { leadId: number; onClose: () => void; onSaved: () => void }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [price, setPrice] = useState('');
  const [entire, setEntire] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const { width } = useWindowDimensions();
  const columns = width >= 768 ? 3 : width >= 360 ? 2 : 1;
  useEffect(() => {
    let active = true;
    api.getInventoryUpdate(leadId).then((data: Snapshot) => {
      if (!active) return;
      setSnapshot(data);
      setRows(data.floors.map(label => ({ label, price: String(data.prices.find(p => p.floor_label === label)?.floor_amount ?? ''), sold: false })));
      setPrice(String(data.property_price ?? ''));
      setEntire(data.entire_sold);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [leadId]);
  const save = async () => {
    if (!snapshot || submitting.current) return;
    if (!notes.trim()) { setError('Enter call verification notes before saving.'); return; }
    submitting.current = true; setSaving(true); setError('');
    try {
      await api.saveInventoryUpdate(leadId, { inventory_version: snapshot.inventory_version, floors: rows, property_price: price, entire_sold: entire, call_notes: notes.trim() });
    } catch (e: any) {
      setError(e.message || 'Unable to save inventory. Please try again.');
      submitting.current = false; setSaving(false); return;
    }
    onSaved();
    onClose();
  };
  const check = (label: string, checked: boolean, disabled: boolean, action: () => void) => (
    <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked, disabled }} disabled={disabled} onPress={action} style={[styles.check, disabled && styles.disabled]}>
      <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color="#235B76" /><Text>{label}</Text>
    </TouchableOpacity>
  );
  return <Modal visible transparent animationType="slide" onRequestClose={() => { if (!submitting.current) onClose(); }}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <View style={styles.panel}>
        <View style={styles.header}><Text style={styles.title}>Update inventory</Text><TouchableOpacity disabled={saving} accessibilityLabel="Close inventory update" onPress={onClose}><Ionicons name="close" size={26} /></TouchableOpacity></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
          <Text>Save changes verified with the contact. The lead creator and admins will be notified.</Text>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!snapshot && !error && <ActivityIndicator />}
          {snapshot && <>
            {check('Entire property sold', entire, saving || snapshot.entire_sold, () => setEntire(!entire))}
            <Text style={styles.unit}>Prices in {snapshot.unit}</Text>
            {!snapshot.can_edit_prices && <Text>Builder availability only. Price changes require inventory access.</Text>}
            <View style={styles.grid}>
              {rows.map((row, index) => <View key={row.label} style={[styles.cell, { width: `${100 / columns}%` }]}>
                <Text style={styles.label}>{row.label}</Text>
                <TextInput accessibilityLabel={`${row.label} price in ${snapshot.unit}`} style={[styles.input, (entire || row.sold || !snapshot.can_edit_prices) && styles.disabled]} keyboardType="decimal-pad" value={row.price} editable={!saving && !entire && !row.sold && snapshot.can_edit_prices} placeholder="Not recorded" onChangeText={value => setRows(previous => previous.map((r, i) => i === index ? { ...r, price: value } : r))} />
                {check('Sold', row.sold, saving || entire, () => setRows(previous => previous.map((r, i) => i === index ? { ...r, sold: !r.sold } : r)))}
              </View>)}
            </View>
            {!rows.length && <><Text style={styles.label}>Property price</Text><TextInput accessibilityLabel={`Property price in ${snapshot.unit}`} style={styles.input} keyboardType="decimal-pad" value={price} onChangeText={setPrice} editable={!saving && !entire && snapshot.can_edit_prices} placeholder="Not recorded" /></>}
            <Text style={styles.label}>Call verification notes (required)</Text>
            <TextInput accessibilityLabel="Call verification notes" style={[styles.input, styles.notes]} multiline maxLength={5000} value={notes} onChangeText={setNotes} editable={!saving} placeholder="Who did you speak to, and what did they confirm?" />
          </>}
        </ScrollView>
        <TouchableOpacity accessibilityRole="button" disabled={!snapshot || saving} onPress={save} style={[styles.save, (!snapshot || saving) && styles.disabled]}>{saving ? <ActivityIndicator color="white" /> : <Text style={styles.saveText}>Save changes</Text>}</TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#0007', justifyContent: 'center', alignItems: 'center', padding: 12 },
  panel: { width: '100%', maxWidth: 760, maxHeight: '90%', backgroundColor: 'white', borderRadius: 16, paddingBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 20, fontWeight: '700' }, body: { paddingHorizontal: 16, paddingBottom: 12 },
  error: { color: '#B91C1C', backgroundColor: '#FEF2F2', padding: 12, marginVertical: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }, cell: { padding: 4 },
  label: { fontWeight: '600', marginVertical: 8 }, input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, minHeight: 44, color: '#172B4D' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 }, disabled: { opacity: 0.45 },
  unit: { marginBottom: 8, fontWeight: '600' }, notes: { minHeight: 80, textAlignVertical: 'top' },
  save: { marginHorizontal: 16, padding: 14, backgroundColor: '#235B76', borderRadius: 10, alignItems: 'center' }, saveText: { color: 'white', fontWeight: '700' },
});
