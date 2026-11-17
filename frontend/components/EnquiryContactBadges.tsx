import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';

type Contact = { contact_is_agent?: boolean; contact_lead_ids?: number[] };
export default function EnquiryContactBadges({ item }: { item: Contact }) {
  if (!item.contact_is_agent && !item.contact_lead_ids?.length) return null;
  return <View style={styles.badges}>
    {item.contact_is_agent && <Text style={[styles.badge, styles.agent]}>Agent</Text>}
    {(item.contact_lead_ids || []).map(id => <TouchableOpacity key={id} accessibilityRole="link" accessibilityLabel={`Existing Client, open lead ${id}`} onPress={() => router.push(`/leads/${id}` as any)}>
      <Text style={[styles.badge, styles.client]}>Existing Client</Text>
    </TouchableOpacity>)}
  </View>;
}
const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  badge: { color: '#fff', fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  agent: { backgroundColor: '#b42318' },
  client: { backgroundColor: '#15803d' },
});
