import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

type Agent = { id: number; full_name?: string; username: string; role: string };
export default function AssignLeadButton({ leadId, assigneeId, inventory = false, onAssigned }: {
  leadId: number; assigneeId?: number | null; inventory?: boolean; onAssigned: () => void;
}) {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [canViewPrivate, setCanViewPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  if (user?.role?.trim().toLowerCase() !== 'admin') return null;

  const load = async () => {
    setLoading(true);
    setError('');
    try { setAgents(await api.getActiveAssignmentUsers()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load active users.'); }
    finally { setLoading(false); }
  };
  const close = () => { if (!saving) setVisible(false); };
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={assigneeId ? "Reassign lead" : "Assign lead"} style={styles.cardAction} onPress={() => {
      setSelected(assigneeId || null); setCanViewPrivate(false); setVisible(true); void load();
    }}>
      <View style={styles.assignIcon}><Ionicons name="person-add" size={18} color="#148399" /></View>
      <Text style={styles.assignLabel}>{assigneeId ? 'Reassign' : 'Assign'}</Text>
    </TouchableOpacity>
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <Text style={styles.title}>Assign {inventory ? 'Inventory' : 'Lead'}</Text>
          <Text>Select the active user responsible for this {inventory ? 'inventory' : 'client'}.</Text>
          <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: canViewPrivate }} disabled={saving} style={styles.agent} onPress={() => setCanViewPrivate(value => !value)}>
            <Ionicons name={canViewPrivate ? 'checkbox' : 'square-outline'} size={22} color="#148399" />
            <Text style={{ flex: 1 }}>Can view phone number and address</Text>
          </TouchableOpacity>
          <Text style={styles.note}>Off by default. Leave unchecked to hide contact details from the assigned user.</Text>
          {loading ? <ActivityIndicator style={{ padding: 24 }} /> : error ? <TouchableOpacity onPress={() => void load()} style={styles.button}><Text style={styles.link}>{error} Tap to retry.</Text></TouchableOpacity> :
            <ScrollView style={{ maxHeight: 320 }}>
              {!agents.length && <Text style={styles.note}>No active users available.</Text>}
              {agents.map(agent => <TouchableOpacity key={agent.id} accessibilityRole="radio" accessibilityState={{ selected: selected === agent.id }} disabled={saving} style={styles.agent} onPress={() => setSelected(agent.id)}>
                <Ionicons name={selected === agent.id ? 'radio-button-on' : 'radio-button-off'} size={22} color="#2563EB" />
                <Text style={{ flex: 1 }}>{agent.full_name || agent.username}</Text>
              </TouchableOpacity>)}
            </ScrollView>}
          <View style={styles.actions}>
            <TouchableOpacity disabled={saving} onPress={close} style={styles.button}><Text>Cancel</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={saving || loading || !!error || !agents.some(agent => agent.id === selected)} style={styles.button} onPress={async () => {
              if (!selected) return;
              setSaving(true);
              try {
                await api.assignLead(leadId, selected, canViewPrivate);
                setVisible(false); onAssigned();
                Alert.alert('Assigned', `${inventory ? 'Inventory' : 'Lead'} assigned successfully.`);
              } catch (e) { Alert.alert('Assignment Failed', e instanceof Error ? e.message : 'Please try again.'); }
              finally { setSaving(false); }
            }}>
              {saving ? <ActivityIndicator /> : <Text style={styles.link}>Assign</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}
const styles = StyleSheet.create({
  cardAction: { flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  assignIcon: { backgroundColor: '#EAF8FA', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4 },
  assignLabel: { color: '#148399', fontSize: 10, fontWeight: '600', marginTop: 2 },
  button: { padding: 12, flexDirection: 'row', gap: 6, alignItems: 'center' },
  link: { color: '#2563EB', fontWeight: '600' },
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0008' },
  sheet: { backgroundColor: 'white', borderRadius: 18, padding: 20, maxHeight: '85%' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  note: { color: '#64748B', marginVertical: 12 },
  agent: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
});
