import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

type BookPresence = Awaited<ReturnType<typeof api.getMonthlyBookPresence>>;

export function useMonthlyBookPresence(
  leads: ReadonlyArray<{ id: number | string; can_view_sensitive?: boolean }>,
  enabled: boolean,
  transaction: '' | 'sale' | 'rent' = '',
) {
  const { user } = useAuth();
  const allowed = enabled && user?.username === 'vsawariya';
  const ids = useMemo(() => allowed
    ? leads.filter(lead => lead.can_view_sensitive !== false).map(lead => Number(lead.id))
      .filter(id => Number.isSafeInteger(id) && id > 0)
    : [], [allowed, leads]);
  const [result, setResult] = useState<{ ids: number[]; transaction: string; presence: BookPresence }>();

  useEffect(() => {
    if (!allowed || !ids.length) return;
    let active = true;
    api.getMonthlyBookPresence(ids, transaction).then(presence => {
      if (active) setResult({ ids, transaction, presence });
    }).catch(() => {});
    return () => { active = false; };
  }, [allowed, ids, transaction]);

  return allowed && result?.ids === ids && result.transaction === transaction ? result.presence : undefined;
}

export function MonthlyBookBadge({ book, onOpen }: { book?: BookPresence[number]; onOpen?: () => void }) {
  if (!book) return null;
  return (
    <View style={styles.row}>
      <Pressable style={styles.bookLink} accessibilityRole="link" onPress={event => {
        event.stopPropagation();
        onOpen?.();
        router.push({ pathname: '/monthly-inventory', params: { entry_id: String(book.entry_id) } });
      }}>
        <Text style={styles.badge}>Present in monthly book · {book.month}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={event => {
        event.stopPropagation();
        Alert.alert('Book Text', book.note?.trim() || 'No book text recorded.');
      }}>
        <Text style={styles.note}>Book Text</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 6 },
  bookLink: { flexShrink: 1 },
  badge: { backgroundColor: '#DCFCE7', color: '#166534', fontSize: 12, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  note: { color: '#1D4ED8', fontSize: 12, textDecorationLine: 'underline' },
});
