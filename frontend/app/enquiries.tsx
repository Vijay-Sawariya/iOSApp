import React, { useCallback, useRef, useState } from 'react';
import { Linking, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { formatEnquiryDate, enquiryStatusLabel } from '../services/enquiryPresentation';
import EnquiryFollowupSummary from '../components/EnquiryFollowupSummary';
import EnquiryCardActions from '../components/EnquiryCardActions';
import { colors } from '../constants/theme';
import { EnquiryButton as Button, EnquiryField as Field, EnquirySelect as Select, EnquiryLoading, enquiryStyles as s } from '../components/EnquiryControls';

const EMPTY = { q: '', status: '', assigned: '', due: false, duplicates: false, sort: 'newest' };
const STATUSES = ['New', 'Contacted', 'Qualified', 'Nurture', 'Disqualified', 'Invalid'];
const WEB_PAGE = 'https://sagarhomelms.com/enquiry_management.php';
export default function EnquiriesScreen() {
  const { user, hasFeature, featureFlagsLoading } = useAuth();
  const canViewEnquiries = !featureFlagsLoading && hasFeature('enquiry_management');
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(() => api.getCachedEnquiryManagement({ ...EMPTY, page: 1 }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState<any[] | null>(null);
  const [syncError, setSyncError] = useState('');
  const request = useRef(0);
  const scroll = useRef<ScrollView>(null);
  const load = useCallback(async (forceNetwork = false, focusedItem?: any) => {
    if (!canViewEnquiries) return;
    const serial = ++request.current;
    setLoading(true); setError('');
    try {
      const result = await api.getEnquiryManagement({ ...applied, page }, { forceNetwork });
      if (serial === request.current) {
        setData(focusedItem && !result.items.some((row: any) => row.id === focusedItem.id)
          ? { ...result, items: [focusedItem, ...result.items] } : result);
      }
    } catch (e: any) { if (serial === request.current) setError(e.message || 'Unable to load enquiries.'); }
    finally { if (serial === request.current) setLoading(false); }
  }, [applied, page, canViewEnquiries]);
  useFocusEffect(useCallback(() => { load(); return () => { request.current++; }; }, [load]));
  const employeeChoices = [{ value: '', label: 'All accessible' }, { value: 'none', label: 'Unassigned' }, ...(data?.users || []).map((u: any) => ({ value: String(u.id), label: u.full_name || u.username }))];
  const update = (key: keyof typeof EMPTY, value: string | boolean) => setFilters(f => ({ ...f, [key]: value }));
  const stats: [string, string][] = [['total', 'Total enquiries'], ['new_count', 'New enquiries'], ['unassigned', 'Unassigned'], ['assigned', 'Assigned'], ['due', 'Follow-ups due'], ['qualified', 'Qualified'], ['converted', 'Converted Main Leads']];
  if (!canViewEnquiries) return <SafeAreaView style={s.page}>
    {featureFlagsLoading ? <EnquiryLoading /> : <Text style={s.muted}>Advertisement Enquiries access is disabled for your account.</Text>}
  </SafeAreaView>;
  return <SafeAreaView style={s.page}>
    <View style={s.header}><TouchableOpacity accessibilityLabel="Back" onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.ink} /></TouchableOpacity>
      <View style={{ flex: 1 }}><Text style={s.title}>Enquiry Management</Text><Text style={s.subtitle}>Website and Meta Ad enquiries</Text></View>
      <TouchableOpacity accessibilityLabel="Refresh enquiries" onPress={() => load(true)}><Ionicons name="refresh" size={22} color={colors.primary} /></TouchableOpacity>
    </View>
    <ScrollView ref={scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={() => load(true)} />}>
      <Text style={s.muted}>Qualify enquiries before converting them to Main Leads.</Text>
      {error ? <View style={s.card}><Text style={s.error}>{error}</Text><Button title="Retry" onPress={() => load(true)} /></View> : null}
      {!data && loading ? <EnquiryLoading /> : null}
      {data ? <>
        <View style={s.row}>{stats.map(([key, label]) => <View key={key} style={[s.card, { width: '47%', flexGrow: 1 }]}><Text style={s.muted}>{label}</Text><Text style={s.title}>{data.stats?.[key] || 0}</Text></View>)}</View>
        <Button title={expanded ? 'Hide filters' : 'Search and filters'} onPress={() => setExpanded(v => !v)} secondary />
        {expanded ? <View style={s.card}>
          <Field label="Name, phone, email or property" value={filters.q} onChange={v => update('q', v)} />
          <Select label="Status" value={filters.status} choices={[{ value: '', label: 'All statuses' }, ...STATUSES.map(value => ({ value, label: enquiryStatusLabel(value) }))]} onChange={v => update('status', v)} />
          <Select label="Employee" value={filters.assigned} choices={employeeChoices} onChange={v => update('assigned', v)} />
          <Select label="Sort" value={filters.sort} choices={['newest', 'oldest', 'name', 'status']} onChange={v => update('sort', v)} />
          {(['due', 'duplicates'] as const).map(key => <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: filters[key] }} key={key} onPress={() => update(key, !filters[key])} style={s.row}>
            <Ionicons name={filters[key] ? 'checkbox' : 'square-outline'} size={24} color={colors.primary} /><Text style={s.text}>{key === 'due' ? 'Follow-ups due' : 'Possible repeat enquiries'}</Text>
          </TouchableOpacity>)}
          <View style={s.row}><Button title="Apply filters" disabled={loading} onPress={() => { setPage(1); setApplied({ ...filters }); }} />
            <Button title="Clear" secondary onPress={() => { setFilters(EMPTY); setApplied({ ...EMPTY }); setPage(1); }} /></View>
        </View> : null}
        <Text style={s.heading}>Enquiries ({data.total})</Text>
        {data.items.length === 0 ? <Text style={s.muted}>No enquiries match this view.</Text> : data.items.map((item: any) => {
          const questions = item.original?.questions || [];
          const bestIndex = questions.findIndex((q: string) => /(?:best|preferred|convenient).*time.*(?:call|contact)|(?:call|contact).*time/i.test(q.replace(/_/g, ' ')));
          const bestTime = item.original?.answers?.[bestIndex];
          return <View key={item.id} style={s.card}>
            <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.muted}>#{item.id} · {item.source}</Text><Text style={[s.badge, item.main_lead_id ? s.convertedBadge : item.status === 'Invalid' ? s.invalidBadge : null]}>{item.main_lead_id ? 'Qualified · Converted' : enquiryStatusLabel(item.status)}</Text></View>
            <TouchableOpacity accessibilityRole="button" disabled={item.status === 'Invalid'} onPress={() => router.push(`/enquiries/${item.id}` as any)}><Text style={s.heading}>{item.full_name}</Text></TouchableOpacity><Text style={[s.text, { color: colors.accent }]}>{item.phone}</Text>
            <Text style={s.text}>{item.property_interest || 'Location not provided'}</Text>
            {!!item.possible_duplicate && <Text style={s.warning}>Possible repeat enquiry</Text>}
            <Text style={s.muted}>Best time to call: {bestTime ? bestTime.replace(/_/g, ' ') : 'Not provided'}</Text>
            <View style={[s.row, { alignItems: 'flex-start', borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }]}>
              <View style={{ flex: 1, gap: 4 }}><Text style={s.muted}>Assigned to</Text><Text style={s.text}>{item.employee || 'Unassigned'}</Text></View>
              <View style={{ flex: 1, gap: 4 }}><Text style={s.muted}>Imported</Text><Text style={s.text}>{formatEnquiryDate(item.imported_at)}</Text></View>
            </View>
            {item.next_followup && <View style={{ borderTopWidth: 1, borderColor: colors.border, paddingTop: 12, gap: 6 }}>
              <EnquiryFollowupSummary followup={item.next_followup} />
              {item.followup_count > 1 && <Text style={s.muted}>{item.followup_count} follow-ups · Open Follow-up details below for history</Text>}
            </View>}
            {item.last_conversation && <View style={s.card}><Text style={s.text}>Last conversation · {item.last_conversation.outcome}</Text><Text style={s.muted}>{item.last_conversation.remarks}</Text><Text style={s.muted}>{formatEnquiryDate(item.last_conversation.created_at)}</Text></View>}
            <EnquiryCardActions item={item} users={data.users || []} canAssign={!!data.can_assign} onChanged={changes => {
              const updated = { ...item, ...changes };
              request.current++;
              setData((current: any) => current ? { ...current, items: current.items.map((row: any) => row.id === item.id ? updated : row) } : current);
              void load(true, updated);
            }} />
          </View>;
        })}
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Button title="Previous" secondary disabled={loading || data.page <= 1} onPress={() => { setPage(data.page - 1); scroll.current?.scrollTo({ y: 0 }); }} />
          <Text style={s.muted}>Page {data.page} of {data.pages}</Text>
          <Button title="Next" secondary disabled={loading || data.page >= data.pages} onPress={() => { setPage(data.page + 1); scroll.current?.scrollTo({ y: 0 }); }} />
        </View>
      </> : null}
      {user?.role?.trim().toLowerCase() === 'admin' && <View style={s.card}>
        <Text style={s.heading}>Sheet synchronisation</Text>
        <Text style={s.muted}>Preview and import use the existing LMS sheet configuration. The web page may ask you to sign in. Server imports run daily at 8:00 AM and 10:30 PM India time once cPanel scheduling is configured. Imported enquiries appear here after refresh.</Text>
        <Button title="Open preview / sync in LMS" secondary onPress={() => { Linking.openURL(WEB_PAGE).catch(() => setSyncError('Unable to open the LMS page.')); }} />
        <Button title="Load sync history" secondary onPress={async () => { try { setSyncError(''); setRuns(await api.getEnquirySyncHistory()); } catch (e: any) { setSyncError(e.message); } }} />
        {!!syncError && <Text style={s.error}>{syncError}</Text>}
        {runs?.map(run => <View key={run.id} style={{ gap: 5 }}><Text style={s.text}>{run.dry_run ? 'Preview' : 'Import'} · {run.status}</Text><Text style={s.muted}>{run.started_at}{`\n`}{run.imported} new · {run.changed} changed · {run.unchanged} unchanged</Text><Text style={s.muted}>{run.issues_json && run.issues_json !== '[]' ? run.issues_json : 'No issues'}</Text></View>)}
        {runs?.length === 0 && <Text style={s.muted}>No sync runs yet.</Text>}
      </View>}
    </ScrollView>
  </SafeAreaView>;
}
