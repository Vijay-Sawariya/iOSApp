import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

type Item = { row: Record<string, any>; url: string };
type Group = { label: string; total: number; items: Item[] };
export default function GlobalSearch() {
  const { user } = useAuth();
  const allowed = !!user?.id && user?.username === 'vsawariya';
  const [q, setQ] = useState('');
  const [exact, setExact] = useState(false);
  const [groups, setGroups] = useState<Record<string, Group>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [request, setRequest] = useState({ q: '', exact: false, page: 1, source: '' });
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { generation.current++; controller.current?.abort(); }, []);
  useEffect(() => { generation.current++; controller.current?.abort(); setGroups({}); setErrors([]); setBusy(false); }, [user?.id, user?.username]);
  const search = async (page = 1, source = '', repeat = false) => {
    if (!allowed) return;
    const term = repeat ? request.q : q.trim();
    const mode = repeat ? request.exact : exact;
    if (term.length < 2) { setError('Enter at least two characters.'); return; }
    Keyboard.dismiss();
    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    const id = ++generation.current;
    setBusy(true); setError(''); setGroups({}); setErrors([]);
    setRequest({ q: term, exact: mode, page, source });
    try {
      const result = await api.globalSearch(term, mode, page, source, result => {
        if (generation.current === id) { setGroups(result.groups); setErrors(result.errors); }
      }, activeController.signal);
      if (generation.current === id) { setGroups(result.groups); setErrors(result.errors); }
    } catch (e) { if (generation.current === id) setError(e instanceof Error ? e.message : 'Search failed.'); }
    finally { if (generation.current === id) setBusy(false); }
  };
  return <SafeAreaView style={styles.screen}>
    <TouchableOpacity onPress={() => router.back()}><Text style={styles.link}>Back</Text></TouchableOpacity>
    <Text style={styles.title}>Global Search</Text>
    {!allowed ? <Text>Global search is available only to vsawariya.</Text> : <>
      <TextInput accessibilityLabel="Search all records" placeholder="Name, phone or address" value={q} onChangeText={setQ}
        maxLength={200} returnKeyType="search" onSubmitEditing={() => search()} style={styles.input} />
      <View style={styles.toggle}><Switch accessibilityLabel="Exact match" value={exact} onValueChange={setExact} /><Text>Exact match</Text></View>
      <Text>Searches records you can access. Phone formatting is ignored.</Text>
      <TouchableOpacity onPress={() => search()}><Text style={styles.link}>Search</Text></TouchableOpacity>
      {busy && <View><ActivityIndicator /><Text>Searching records… Results appear as sources finish.</Text></View>}
      {!!error && <Text accessibilityRole="alert">{error}</Text>}
      {!!errors.length && <Text>Some sources could not be searched: {errors.join(', ')}. Please retry.</Text>}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        {!busy && !!request.q && !error && !errors.length && !Object.values(groups).some(g => g.total) && <Text>No accessible records match.</Text>}
        {Object.entries(groups).map(([key, group]) => group.total > 0 && <View key={key} style={styles.group}>
          <Text style={styles.heading}>{group.label} ({group.total})</Text>
          {group.items.map(item => <TouchableOpacity key={item.row.id} style={styles.card} disabled={!item.url} onPress={() => router.push(item.url as any)}>
            <Text style={styles.heading}>{item.row.name || item.row.full_name || item.row.builder_name || item.row.owner_name || group.label} #{item.row.id}</Text>
            {Object.entries(item.row).filter(([k, v]) => k !== 'id' && v != null && v !== '').map(([k, v]) => <Text key={k}>{k.replace(/_/g, ' ')}: {String(v)}</Text>)}
            {!!item.url && <Text style={styles.link}>Open source</Text>}
          </TouchableOpacity>)}
          {group.total > 20 && <View style={styles.toggle}>
            {request.page > 1 && <TouchableOpacity onPress={() => search(request.page - 1, key, true)}><Text style={styles.link}>Previous</Text></TouchableOpacity>}
            <Text>Page {request.page} of {Math.ceil(group.total / 20)}</Text>
            {request.page * 20 < group.total && <TouchableOpacity onPress={() => search(request.page + 1, key, true)}><Text style={styles.link}>Next</Text></TouchableOpacity>}
          </View>}
        </View>)}
        {!!request.source && <TouchableOpacity onPress={() => search(1, '', true)}><Text style={styles.link}>All sources</Text></TouchableOpacity>}
      </ScrollView>
    </>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 16, backgroundColor: '#fff' }, title: { fontSize: 26, fontWeight: '700', marginVertical: 12 }, heading: { fontSize: 17, fontWeight: '600' }, input: { borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 12 }, toggle: { flexDirection: 'row', alignItems: 'center', gap: 12 }, link: { color: '#254ac0', paddingVertical: 10 }, group: { marginVertical: 16 }, card: { borderBottomWidth: 1, borderColor: '#ddd', paddingVertical: 12 } });
