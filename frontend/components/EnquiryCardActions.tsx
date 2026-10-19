import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '../services/api';
import { colors } from '../constants/theme';
import { EnquiryButton as Button, EnquiryField as Field, EnquirySelect as Select, enquiryStyles as s } from './EnquiryControls';

type Employee = { id: number; username: string; full_name: string };
type Props = {
  item: any;
  users: Employee[];
  canAssign: boolean;
  onChanged: (changes: Record<string, unknown>) => void;
};

export default function EnquiryCardActions({ item, users, canAssign, onChanged }: Props) {
  const [dialog, setDialog] = useState<'assign' | 'link' | null>(null);
  const [owner, setOwner] = useState('');
  const [query, setQuery] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const writing = useRef(false);
  const searchVersion = useRef(0);
  const converted = !!item.main_lead_id;
  const invalid = item.status === 'Invalid';
  const choices = users.map(u => ({ value: String(u.id), label: u.username || u.full_name }));
  const close = () => { if (!writing.current) { searchVersion.current++; setDialog(null); } };
  const open = (mode: 'assign' | 'link') => {
    searchVersion.current++;
    setOwner(String(item.assigned_to || '')); setQuery(''); setLeads([]); setSelected(null);
    setError(''); setSearching(false); setSearched(false); setDialog(mode);
  };
  const save = async (action: string) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError('');
    try {
      const result = await api.updateEnquiry(item.id, action,
        action === 'assign' || action === 'link_existing' ? { assigned_to: Number(owner), ...(action === 'link_existing' ? { lead_id: selected.id } : {}) } : {});
      const employee = users.find(u => String(u.id) === owner);
      const changes = action === 'mark_invalid' ? { status: 'Invalid' } : action === 'restore_invalid' ? { status: 'New' } : {
        assigned_to: Number(owner), employee: employee?.full_name || employee?.username,
        ...(action === 'link_existing' ? { status: 'Qualified', main_lead_id: result.lead_id } : {}),
      };
      searchVersion.current++; setDialog(null); onChanged(changes);
    } catch (e: any) {
      const message = e.message || 'Unable to update enquiry. Please retry.';
      setError(message); Alert.alert('Unable to save', message);
    } finally { writing.current = false; setBusy(false); }
  };
  const search = async () => {
    const version = ++searchVersion.current;
    setSearching(true); setSearched(false); setSelected(null); setLeads([]); setError('');
    try {
      const found = await api.searchEnquiryLeads(item.id, query.trim());
      if (version === searchVersion.current) { setLeads(found); setSearched(true); }
    } catch (e: any) { if (version === searchVersion.current) setError(e.message || 'Unable to search leads.'); }
    finally { if (version === searchVersion.current) setSearching(false); }
  };
  const icon = (name: keyof typeof Ionicons.glyphMap, label: string, color: string, onPress: () => void, disabled = false) =>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy} onPress={onPress} style={{ width: 44, height: 44, borderWidth: 1, borderColor: color, borderRadius: 7, alignItems: 'center', justifyContent: 'center', opacity: disabled || busy ? .4 : 1 }}>
      <Ionicons name={name} size={22} color={color} />
    </TouchableOpacity>;
  return <>
    <View style={[s.row, { borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }]}>
      {!converted && icon(invalid ? 'arrow-undo-outline' : 'ban-outline', invalid ? 'Restore to New' : 'Junk / Invalid', invalid ? '#64748b' : '#ef3340', () => {
        if (invalid) { void save('restore_invalid'); return; }
        Alert.alert('Mark as Junk / Invalid?', 'This enquiry can be restored to New later.', [
          { text: 'Cancel', style: 'cancel' }, { text: 'Mark Invalid', style: 'destructive', onPress: () => { void save('mark_invalid'); } },
        ]);
      })}
      {!converted && canAssign && icon('person-add-outline', 'Assignment', '#06b6d4', () => open('assign'))}
      {icon('open-outline', invalid ? 'Open (restore to New first)' : 'Open enquiry', '#1677ff', () => router.push(`/enquiries/${item.id}` as any), invalid)}
      {converted ? icon('eye-outline', 'View lead', '#159457', () => router.push(`/leads/${item.main_lead_id}` as any)) :
        icon('link-outline', 'Link existing lead', '#159457', () => open('link'), invalid)}
      {busy && <ActivityIndicator size="small" color={colors.primary} />}
    </View>
    <Modal visible={dialog !== null} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: '#0007', justifyContent: 'flex-end' }} onPress={close}>
        <Pressable onPress={event => event.stopPropagation()} style={{ backgroundColor: colors.surfaceRaised, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%', padding: 20, paddingBottom: 35, gap: 12 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.heading}>{dialog === 'assign' ? 'Assign Enquiry' : 'Link existing lead'}</Text><Button title="Close" secondary disabled={busy} onPress={close} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <Text style={s.text}>#{item.id} · {item.full_name}</Text>
            {dialog === 'link' && <>
              <Field label="Search by client name or phone number" value={query} onChange={value => { searchVersion.current++; setQuery(value); setSelected(null); setLeads([]); setSearching(false); setSearched(false); }} />
              <Button title={searching ? 'Searching…' : 'Search leads'} secondary disabled={busy || searching || query.trim().length < 2} onPress={search} />
              {searched && !leads.length && <Text style={s.muted}>No accessible Buyer/Tenant leads match.</Text>}
              {leads.map(lead => <TouchableOpacity key={lead.id} disabled={busy} accessibilityRole="radio" accessibilityState={{ selected: selected?.id === lead.id }} onPress={() => setSelected(lead)} style={[s.card, selected?.id === lead.id && { borderColor: colors.primary }]}>
                <Text style={s.text}>{selected?.id === lead.id ? '✓ ' : ''}#{lead.id} · {lead.name}</Text><Text style={s.muted}>{lead.phone} · {lead.location}</Text>
              </TouchableOpacity>)}
              <Text style={s.muted}>Assigns this enquiry and marks it Qualified · Converted. The existing lead’s ownership is unchanged.</Text>
            </>}
            <Select label={dialog === 'assign' ? 'Username' : 'Assignment'} value={owner} choices={choices} onChange={setOwner} disabled={busy || !canAssign} />
            {!!error && <Text style={s.error}>{error}</Text>}
            <Button title={busy ? 'Saving…' : dialog === 'assign' ? 'Assign' : 'Confirm existing lead'} disabled={busy || !choices.some(c => c.value === owner) || (dialog === 'link' && !selected)} onPress={() => { void save(dialog === 'assign' ? 'assign' : 'link_existing'); }} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  </>;
}
