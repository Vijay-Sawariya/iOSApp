import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii } from '../constants/theme';

export const CONSTRUCTION_STAGES = ['', 'Demolished', 'Basement Digging', 'Basement Slab Completed', 'FF Slab Completed', 'SF Slab Completed', 'TF Slab Completed', 'Structure Ready', 'Interior Work Going On', 'Final Stage'];

export function ConstructionStage({ value, onSave }: { value: string; onSave: (stage: string) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const select = async (stage: string) => {
    if (saving) return;
    if (stage === value) { setOpen(false); return; }
    setSaving(true);
    try { await onSave(stage); setOpen(false); }
    catch (error: any) { Alert.alert('Unable to save stage', error?.message || 'Please try again.'); }
    finally { setSaving(false); }
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`Construction stage: ${value || 'Not set'}. Tap to change`}
      accessibilityState={{ disabled: saving, expanded: open }} disabled={saving} hitSlop={6}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]} onPress={() => setOpen(true)}>
      {saving ? <ActivityIndicator size="small" color="#0891B2" /> : <Ionicons name="construct-outline" size={14} color="#0891B2" />}
      <Text style={styles.chipText}>{value || 'Add construction stage'}</Text>
      <Ionicons name="chevron-down" size={12} color="#0891B2" />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => !saving && setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Dismiss stage picker" disabled={saving} onPress={() => setOpen(false)} />
        <View style={styles.picker}>
          <View style={styles.header}>
            <Text style={styles.title}>Construction stage</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close stage picker" disabled={saving} hitSlop={10} onPress={() => setOpen(false)}>
              <Ionicons name="close" size={22} color={colors.inkMuted} />
            </Pressable>
          </View>
          <View style={styles.options}>
            {CONSTRUCTION_STAGES.map(stage => <Pressable key={stage} accessibilityRole="radio"
              accessibilityState={{ checked: stage === value, disabled: saving }} disabled={saving}
              style={[styles.option, stage === value && styles.selected]} onPress={() => void select(stage)}>
              <Text style={[styles.optionText, stage === value && styles.selectedText]}>{stage || 'Not specified'}</Text>
              {stage === value && <Ionicons name="checkmark" size={16} color="#0891B2" />}
            </Pressable>)}
          </View>
          {saving && <ActivityIndicator accessibilityLabel="Saving stage" color="#0891B2" />}
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
