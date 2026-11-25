import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../constants/theme';

export const INVENTORY_DIRECTIONS = ['North', 'NorthEast', 'East', 'SouthEast', 'South', 'SouthWest', 'West', 'NorthWest'];

export function InventoryDirection({ value, onSave }: { value: string; onSave: (direction: string) => Promise<void> }) {
  const directionKey = value.trim().replace(/[\s-]+/g, '').toLowerCase();
  const currentDirection = INVENTORY_DIRECTIONS.find(direction => direction.toLowerCase() === directionKey) || value;
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const select = async (direction: string) => {
    if (saving) return;
    if (direction === currentDirection) { setOpen(false); return; }
    setSaving(true);
    try { await onSave(direction); setOpen(false); }
    catch (error: any) { Alert.alert('Unable to save direction', error?.message || 'Please try again.'); }
    finally { setSaving(false); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Inventory direction: ${currentDirection || 'Not set'}. Tap to change`}
      accessibilityState={{ disabled: saving, expanded: open }} disabled={saving} hitSlop={6}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]} onPress={() => setOpen(true)}>
      {saving ? <ActivityIndicator size="small" color="#0891B2" /> : <Ionicons name="compass-outline" size={14} color="#0891B2" />}
      <Text style={styles.chipText}>{currentDirection || 'Add direction'}</Text>
      <Ionicons name="chevron-down" size={12} color="#0891B2" />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => !saving && setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Dismiss direction picker" disabled={saving} onPress={() => setOpen(false)} />
        <View style={styles.picker}>
          <View style={styles.header}>
            <Text style={styles.title}>Inventory direction</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close direction picker" disabled={saving} hitSlop={10} onPress={() => setOpen(false)}>
              <Ionicons name="close" size={22} color={colors.inkMuted} />
            </Pressable>
          </View>
          <View style={styles.options}>
            {INVENTORY_DIRECTIONS.map(direction => <Pressable key={direction} accessibilityRole="radio"
              accessibilityState={{ checked: direction === currentDirection, disabled: saving }} disabled={saving}
              style={[styles.option, direction === currentDirection && styles.selected]} onPress={() => void select(direction)}>
              <Text style={[styles.optionText, direction === currentDirection && styles.selectedText]}>{direction}</Text>
              {direction === currentDirection && <Ionicons name="checkmark" size={16} color="#0891B2" />}
            </Pressable>)}
          </View>
          {saving && <ActivityIndicator accessibilityLabel="Saving direction" color="#0891B2" />}
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.pill, borderWidth: 1, borderColor: '#C5E8EC', backgroundColor: '#ECFEFF' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#0891B2' },
  overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0007' },
  picker: { width: '100%', maxWidth: 400, alignSelf: 'center', borderRadius: radii.lg, padding: 20, gap: 16, backgroundColor: colors.surfaceRaised },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 17, fontWeight: '700', color: colors.ink },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { width: '48%', flexGrow: 1, minHeight: 44, padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  selected: { backgroundColor: '#ECFEFF', borderColor: '#0891B2' },
  optionText: { fontSize: 14, color: colors.ink },
  selectedText: { color: '#0891B2', fontWeight: '600' },
});
