import { useSharedDropdowns } from '../../services/sharedDropdowns';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { formatEnquiryDate, enquiryStatusLabel } from '../../services/enquiryPresentation';
import { colors } from '../../constants/theme';
import { AMENITIES, BHK_OPTIONS, CLIENT_STATUSES, FACINGS, FLOORS, LEAD_SOURCES, LOCATIONS, PROPERTY_TYPES, UNITS } from '../../constants/leadOptions';
import { EnquiryButton as Button, EnquiryField as Field, EnquirySelect as Select, EnquiryLoading, enquiryStyles as s } from '../../components/EnquiryControls';

const qualificationDefaults: Record<string, string> = {
  name: '', phone: '', lead_type: 'buyer', lead_source: '', lead_status: 'Warm', location: '', property_type: '',
  max_possession_wait_months: '', area_size: '', floor: '', bhk: '', building_facing: '', required_amenities: '', budget_min: '', budget_max: '', unit: 'CR', notes: '',
};
export default function EnquiryDetailScreen() {
  useSharedDropdowns();
  const { id } = useLocalSearchParams<{ id: string }>();
  const enquiryId = Number(id);
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState(qualificationDefaults);
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leadQuery, setLeadQuery] = useState('');
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searched, setSearched] = useState(false);
  const sequence = useRef(0);
  const leadSequence = useRef(0);
  const writing = useRef(false);
  const load = useCallback(async (initialize = true) => {
    const serial = ++sequence.current;
    setLoading(true); setError('');
    if (initialize) { setData(null); setLeads([]); setSelectedLead(null); setLeadQuery(''); setSearched(false); }
    try {
      const result = await api.getEnquiryDetail(enquiryId);
      if (sequence.current !== serial) return;
      setData(result);
      if (initialize) {
        const values = { ...qualificationDefaults, name: result.item.full_name || '', phone: result.item.phone || '', ...result.item.qualification };
        setForm(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v ?? '')])));
        setOwner(String(result.item.assigned_to || ''));
      }
    } catch (e: any) { if (sequence.current === serial) setError(e.message || 'Unable to load enquiry.'); }
    finally { if (sequence.current === serial) setLoading(false); }
  }, [enquiryId]);
  useFocusEffect(useCallback(() => { load(); return () => { sequence.current++; leadSequence.current++; }; }, [load]));
  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));
  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError('');
    try {
      const result = await api.updateEnquiry(enquiryId, action, payload);
      await load(false);
      Alert.alert('Saved', result.lead_id ? `Linked to Main Lead #${result.lead_id}.` : 'Enquiry updated.');
    } catch (e: any) { setError(e.message || 'Unable to save enquiry.'); Alert.alert('Unable to save', e.message || 'Please retry.'); }
    finally { writing.current = false; setBusy(false); }
  };
  const search = async () => {
    const serial = ++leadSequence.current;
    setSearching(true); setSearchError(''); setLeads([]); setSelectedLead(null); setSearched(false);
    try { const found = await api.searchEnquiryLeads(enquiryId, leadQuery.trim()); if (serial === leadSequence.current) { setLeads(found); setSearched(true); } }
    catch (e: any) { if (serial === leadSequence.current) setSearchError(e.message); }
    finally { if (serial === leadSequence.current) setSearching(false); }
  };
  const item = data?.item;
  const readOnly = !!item?.main_lead_id;
  const disabled = busy || loading;
  const employeeChoices = (data?.users || []).map((u: any) => ({ value: String(u.id), label: u.full_name || u.username }));
  const field = (key: string, label: string, numeric = false, multiline = false) => <Field key={key} label={label} value={form[key] || ''} onChange={v => update(key, v)} numeric={numeric} multiline={multiline} />;
  const select = (key: string, label: string, choices: readonly any[], multiple = false) => <Select key={key} label={label} value={form[key] || ''} choices={choices} onChange={v => update(key, v)} multiple={multiple} />;
  return <SafeAreaView style={s.page}>
    <View style={s.header}><TouchableOpacity accessibilityLabel="Back to enquiries" onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.ink} /></TouchableOpacity><View style={{ flex: 1 }}><Text style={s.title}>Enquiry #{id}</Text><Text style={s.subtitle}>{item?.full_name || 'Enquiry details'}</Text></View></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={() => load(false)} />}>
      {error ? <View style={s.card}><Text style={s.error}>{error}</Text><Button title="Retry loading" secondary onPress={() => load(false)} disabled={busy} /></View> : null}
      {loading && !item ? <EnquiryLoading /> : null}
      {item && <>
        <View style={s.card}>
          <View style={s.row}><Text style={s.heading}>{item.full_name}</Text><Text style={[s.badge, readOnly ? s.convertedBadge : item.status === 'Invalid' ? s.invalidBadge : null]}>{readOnly ? 'Qualified · Converted' : enquiryStatusLabel(item.status)}</Text></View>
          <Text style={s.text}>{item.phone}{item.email ? `\n${item.email}` : ''}</Text>
          <Text style={s.text}>{item.property_interest || 'Property not provided'}</Text>
          <Text style={s.muted}>Source: {item.source} · Imported {formatEnquiryDate(item.imported_at)}{`\n`}Worksheet: {item.worksheet} · Row {item.source_row}</Text>
          {!!item.original?.campaign && <Text style={s.muted}>Campaign: {item.original.campaign}{`\n`}Source serial: {item.original.source_serial} · Quality: {item.original.quality_index}</Text>}
          <View style={s.row}>
            <Button title="Call" secondary onPress={() => { Linking.openURL(`tel:${item.phone}`).catch(() => Alert.alert('Unable to open dialler')); }} />
            <Button title="WhatsApp" secondary onPress={() => { const digits = String(item.phone).replace(/\D/g, ''); const phone = digits.length === 10 ? `91${digits}` : digits; Linking.openURL(`https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${item.full_name}, `)}`).catch(() => Alert.alert('Unable to open WhatsApp')); }} />
          </View>
          {(item.original?.questions || []).map((question: string, index: number) => <View key={index}><Text style={s.label}>{question.replace(/_/g, ' ')}</Text><Text style={s.text}>{String(item.original?.answers?.[index] || 'No answer supplied').replace(/_/g, ' ')}</Text></View>)}
          {item.source_changed && <><Text style={s.warning}>Source data changed. Original contact values and workflow were preserved.</Text><Text selectable style={s.muted}>{JSON.stringify(item.current, null, 2)}</Text></>}
          {data.matching_lead_count > 0 && <Text style={s.warning}>{data.matching_lead_count} matching Main Lead(s). Use Link existing lead to avoid duplicates.</Text>}
          {data.duplicates.map((d: any) => <TouchableOpacity key={d.id} onPress={() => router.push(`/enquiries/${d.id}` as any)}><Text style={[s.text, { color: colors.primary }]}>Repeat enquiry #{d.id} · {d.property_interest}</Text></TouchableOpacity>)}
          {readOnly ? <><Text style={s.muted}>Converted {item.converted_at}. This enquiry is read-only.</Text><Button title={`View Main Lead #${item.main_lead_id}`} onPress={() => router.push(`/leads/${item.main_lead_id}` as any)} /></> :
            <Button title={item.status === 'Invalid' ? 'Restore to New' : 'Mark as Junk / Invalid'} disabled={disabled} secondary onPress={() => {
              if (item.status === 'Invalid') { run('restore_invalid'); return; }
              Alert.alert('Mark as Junk / Invalid?', 'This enquiry will be marked Invalid. You can restore it to New later.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Mark Invalid', style: 'destructive', onPress: () => run('mark_invalid') }]);
            }} />}
        </View>
        {!readOnly && <View pointerEvents={disabled ? 'none' : 'auto'} style={{ gap: 12, opacity: busy ? .6 : 1 }}>
          <View style={s.card}>
            <Text style={s.heading}>Assignment</Text>
            <Select label="Employee *" value={owner} choices={employeeChoices} onChange={setOwner} disabled={!data.can_assign} />
            {data.can_assign && <Button title="Save assignment" disabled={disabled || !owner} secondary onPress={() => run('assign', { assigned_to: Number(owner) })} />}
            <Text style={s.muted}>An active employee is required for conversion and follow-ups. Save assignment before scheduling a follow-up.</Text>
          </View>
          <View style={s.card}>
            <Text style={s.heading}>Qualification</Text><Text style={s.muted}>Conversion saves these requirements, creates the Buyer/Tenant client and assigns the selected employee.</Text>
            {select('lead_type', 'Lead type *', ['buyer', 'tenant'])}
            {field('name', 'Name *')}{field('phone', 'Phone *')}
            {select('lead_source', 'Lead source', LEAD_SOURCES)}
            {select('lead_status', 'Lead status', CLIENT_STATUSES)}
            {select('location', 'Location *', LOCATIONS, true)}
            {select('property_type', 'Property type *', PROPERTY_TYPES)}
            {field('max_possession_wait_months', 'Maximum possession wait (months)', true)}
            {field('area_size', 'Area size (YD)', true)}
            {select('floor', 'Floor', FLOORS, true)}{select('bhk', 'BHK', BHK_OPTIONS, true)}
            {select('building_facing', 'Facing', FACINGS, true)}
            {select('required_amenities', 'Additional amenities', AMENITIES.map(a => ({ value: a.key, label: a.label })), true)}
            {field('budget_min', 'Minimum budget *', true)}{field('budget_max', 'Maximum budget *', true)}
            {select('unit', 'Budget unit *', UNITS)}{field('notes', 'Notes', false, true)}
            {data.can_convert ? <Button title={busy ? 'Saving…' : 'Convert to Main Lead'} disabled={disabled || !owner} onPress={() => Alert.alert('Convert to Main Lead?', 'Save qualification and create a client assigned to the selected employee?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Convert', onPress: () => run('qualify', { ...form, assigned_to: Number(owner) }) }])} /> : <Text style={s.muted}>Main Lead conversion is available to administrators and senior agents.</Text>}
          </View>
          <View style={s.card}>
            <Text style={s.heading}>Link existing lead</Text><Text style={s.muted}>For enquiries already converted to a Buyer or Tenant lead. The existing lead’s ownership stays unchanged.</Text>
            <Field label="Search by client name or phone" value={leadQuery} onChange={value => { leadSequence.current++; setLeadQuery(value); setLeads([]); setSelectedLead(null); setSearched(false); setSearching(false); }} />
            <Button title={searching ? 'Searching…' : 'Search leads'} secondary disabled={searching || leadQuery.trim().length < 2 || disabled} onPress={search} />
            {!!searchError && <Text style={s.error}>{searchError}</Text>}
            {searched && leads.length === 0 && <Text style={s.muted}>No accessible Buyer/Tenant leads match.</Text>}
            {leads.map(lead => <TouchableOpacity key={lead.id} style={[s.card, selectedLead?.id === lead.id && { borderColor: colors.primary }]} onPress={() => { setSelectedLead(lead); setOwner(String(lead.assigned_to || item.assigned_to || '')); }}><Text style={s.text}>{selectedLead?.id === lead.id ? '✓ ' : ''}#{lead.id} · {lead.name}</Text><Text style={s.muted}>{lead.phone} · {lead.location}</Text></TouchableOpacity>)}
            <Button title="Confirm existing lead" disabled={disabled || !selectedLead || !owner} onPress={() => Alert.alert('Link existing lead?', `Mark this enquiry Qualified · Converted and link to #${selectedLead.id} ${selectedLead.name}?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Link lead', onPress: () => run('link_existing', { assigned_to: Number(owner), lead_id: selectedLead.id }) }])} />
          </View>

        </View>}
        {readOnly && <View style={s.card}><Text style={s.heading}>Saved qualification</Text>{Object.entries(item.qualification || {}).filter(([, v]) => v !== '').map(([k, v]) => <Text key={k} style={s.text}>{k.replace(/_/g, ' ')}: {String(v)}</Text>)}</View>}
        <View style={s.card}><Text style={s.heading}>Activity and assignment history</Text>
          {!data.history.length && <Text style={s.muted}>No activity yet.</Text>}
          {data.history.map((h: any) => <View key={h.id}><Text style={s.text}>{h.event_type} · {h.actor || 'Sync service'}</Text><Text style={s.muted}>{h.created_at}</Text><Text selectable style={s.muted}>{h.details}</Text></View>)}
        </View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
