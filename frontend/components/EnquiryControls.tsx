import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors, radii } from '../constants/theme';

export const enquiryStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  title: { fontSize: 21, fontWeight: '800', color: colors.ink },
  subtitle: { fontSize: 12, color: colors.inkMuted, marginTop: 4, lineHeight: 18 },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: { padding: 16, borderRadius: radii.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  heading: { fontSize: 17, fontWeight: '800', color: colors.ink },
  text: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  muted: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
  badge: { color: colors.primary, backgroundColor: colors.primarySoft, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '700' },
  invalidBadge: { color: '#a32d37', backgroundColor: '#fce8e8' },
  convertedBadge: { color: '#26724d', backgroundColor: '#e8f5ee' },
  warning: { color: '#88600b', backgroundColor: '#fff4d8', padding: 10, borderRadius: 8, fontSize: 13 },
  error: { color: '#b42318', padding: 12, backgroundColor: '#feeceb', borderRadius: 8 },
  label: { color: colors.inkMuted, fontSize: 12, fontWeight: '700' },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surfaceMuted, color: colors.ink, fontSize: 14 },
  button: { minHeight: 42, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  buttonText: { color: colors.white, fontSize: 13, fontWeight: '700' },
  centered: { padding: 32, alignItems: 'center', gap: 12 },
});

export function EnquiryButton({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[enquiryStyles.button, secondary && enquiryStyles.secondary, disabled && { opacity: 0.45 }]}>
    <Text style={[enquiryStyles.buttonText, secondary && { color: colors.ink }]}>{title}</Text>
  </TouchableOpacity>;
}

export function EnquiryField({ label, value, onChange, numeric, multiline }: { label: string; value: string; onChange: (value: string) => void; numeric?: boolean; multiline?: boolean }) {
  return <View style={{ gap: 5 }}><Text style={enquiryStyles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} style={[enquiryStyles.input, multiline && { minHeight: 90, textAlignVertical: 'top' }]} value={value} onChangeText={onChange}
      keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} maxLength={multiline ? 2000 : 255} />
  </View>;
}

type Choice = string | { value: string; label: string };
export function EnquirySelect({ label, value, choices, onChange, multiple, disabled }: { label: string; value: string; choices: readonly Choice[]; onChange: (value: string) => void; multiple?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const options = choices.map(c => typeof c === 'string' ? { value: c, label: c } : c);
  const selected = multiple ? value.split(',').filter(Boolean) : [value];
  // Saved custom values remain visible and editable alongside current choices.
  selected.forEach(v => { if (v && !options.some(o => o.value === v)) options.push({ value: v, label: v }); });
  const display = selected.map(v => options.find(o => o.value === v)?.label || v).filter(Boolean).join(', ');
  return <View style={{ gap: 5 }}><Text style={enquiryStyles.label}>{label}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} style={[enquiryStyles.input, disabled && { opacity: .6 }]} onPress={() => { setSearch(''); setOpen(true); }}>
      <Text style={enquiryStyles.text}>{display || 'Select'} ▾</Text>
    </TouchableOpacity>
    <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
      <Pressable style={{ flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' }} onPress={() => setOpen(false)}>
        <Pressable onPress={e => e.stopPropagation()} style={{ backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 35, maxHeight: '80%', gap: 12 }}>
          <Text style={enquiryStyles.heading}>{label}</Text>
          <TextInput accessibilityLabel={`Search ${label}`} style={enquiryStyles.input} placeholder="Search options" value={search} onChangeText={setSearch} />
          <ScrollView keyboardShouldPersistTaps="handled">
            {options.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).map(o => <TouchableOpacity key={o.value} style={{ paddingVertical: 14 }} onPress={() => {
              if (multiple) onChange(selected.includes(o.value) ? selected.filter(v => v !== o.value).join(',') : [...selected, o.value].join(','));
              else { onChange(o.value); setOpen(false); }
            }}><Text style={enquiryStyles.text}>{selected.includes(o.value) ? '✓ ' : ''}{o.label}</Text></TouchableOpacity>)}
          </ScrollView>
          <EnquiryButton title="Done" onPress={() => setOpen(false)} />
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}
export function EnquiryLoading() { return <View style={enquiryStyles.centered}><ActivityIndicator color={colors.primary} /><Text style={enquiryStyles.muted}>Loading enquiries…</Text></View>; }

// Keep the wire value in IST even when the device uses another time zone.
export function EnquiryDateTime({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  const selected = value ? new Date(`${value}:00+05:30`) : new Date(Date.now() + 3600000);
  const date = Number.isNaN(selected.getTime()) ? new Date() : selected;
  const save = (next: Date) => onChange(new Date(next.getTime() + 330 * 60000).toISOString().slice(0, 16));
  return <View style={{ gap: 8 }}>
    <EnquiryField label="Date and time (Asia/Kolkata) · YYYY-MM-DDTHH:mm *" value={value} onChange={onChange} />
    {Platform.OS !== 'web' && <View style={enquiryStyles.row}>
      <EnquiryButton title="Choose date" secondary onPress={() => setMode('date')} />
      <EnquiryButton title="Choose time" secondary onPress={() => setMode('time')} />
    </View>}
    {mode && Platform.OS !== 'web' && <View>
      <DateTimePicker value={date} mode={mode} timeZoneName="Asia/Kolkata" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={(event, next) => { if (Platform.OS !== 'ios' || event.type === 'dismissed') setMode(null); if (next && event.type !== 'dismissed') save(next); }} />
      {Platform.OS === 'ios' && <EnquiryButton title="Done" secondary onPress={() => { if (!value) save(date); setMode(null); }} />}
    </View>}
  </View>;
}
