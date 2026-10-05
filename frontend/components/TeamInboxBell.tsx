import React, { useCallback, useState } from 'react';
import { AppState, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../services/api';

export default function TeamInboxBell() {
  const [count, setCount] = useState<number | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (!active || pending || AppState.currentState !== 'active') return;
      pending = true;
      try {
        const summary = await api.getTeamInboxSummary();
        if (active) setCount(Number(summary.pending_requests) + Number(summary.unread_updates));
      } catch { if (active) setCount(null); }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); listener.remove(); };
  }, []));
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Team Inbox, ${count === null ? 'count unavailable' : `${count} pending requests and unread updates`}`} onPress={() => router.push('/collaboration')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name="notifications-outline" size={23} color="white" />
    {count !== null && count > 0 && <View style={{ position: 'absolute', right: 0, top: 0, borderRadius: 10, paddingHorizontal: 4, backgroundColor: '#DC2626', minWidth: 18 }}><Text style={{ color: 'white', fontSize: 11, textAlign: 'center' }}>{count > 99 ? '99+' : count}</Text></View>}
  </TouchableOpacity>;
}
