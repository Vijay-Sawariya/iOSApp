import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { router } from 'expo-router';

interface DashboardStats {
  total_leads: number;
  hot_leads: number;
  warm_leads: number;
  cold_leads: number;
  total_builders: number;
  today_reminders: number;
  pending_reminders: number;
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = async () => {
    try {
      const data = await api.getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.full_name}</Text>
        </View>
        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#3B82F6' }]}>
          <Ionicons name="people" size={32} color="#FFFFFF" />
          <Text style={styles.statValue}>{stats?.client_leads || 0}</Text>
          <Text style={styles.statLabel}>Client Leads</Text>
          <Text style={styles.statSubtext}>Buyers & Tenants</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: '#10B981' }]}>
          <Ionicons name="home" size={32} color="#FFFFFF" />
          <Text style={styles.statValue}>{stats?.inventory_leads || 0}</Text>
          <Text style={styles.statLabel}>Inventory Leads</Text>
          <Text style={styles.statSubtext}>Sellers & Landlords</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: '#EF4444' }]}>
          <Ionicons name="flame" size={32} color="#FFFFFF" />
          <Text style={styles.statValue}>{stats?.hot_leads || 0}</Text>
          <Text style={styles.statLabel}>Hot Leads</Text>
        </View>

        <View style={[styles.statCard, { backgroundColor: '#F59E0B' }]}>
          <Ionicons name="sunny" size={32} color="#FFFFFF" />
          <Text style={styles.statValue}>{stats?.warm_leads || 0}</Text>
          <Text style={styles.statLabel}>Warm Leads</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/clients')}
        >
          <View style={styles.actionIcon}>
            <Ionicons name="person-add" size={24} color="#3B82F6" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>View Clients</Text>
            <Text style={styles.actionSubtitle}>Buyers & Tenants</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/(tabs)/inventory')}
        >
          <View style={styles.actionIcon}>
            <Ionicons name="home" size={24} color="#10B981" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>View Inventory</Text>
            <Text style={styles.actionSubtitle}>Sellers, Landlords & Builders</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => router.push('/leads/add')}
        >
          <View style={styles.actionIcon}>
            <Ionicons name="add-circle" size={24} color="#F59E0B" />
          </View>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Add New Lead</Text>
            <Text style={styles.actionSubtitle}>Client or Inventory</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Overview</Text>
        <View style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <Ionicons name="business" size={20} color="#6B7280" />
            <Text style={styles.overviewLabel}>Total Builders</Text>
            <Text style={styles.overviewValue}>{stats?.total_builders || 0}</Text>
          </View>
          <View style={styles.overviewRow}>
            <Ionicons name="calendar" size={20} color="#6B7280" />
            <Text style={styles.overviewLabel}>Today's Reminders</Text>
            <Text style={styles.overviewValue}>{stats?.today_reminders || 0}</Text>
          </View>
          <View style={styles.overviewRow}>
            <Ionicons name="time" size={20} color="#6B7280" />
            <Text style={styles.overviewLabel}>Pending Reminders</Text>
            <Text style={styles.overviewValue}>{stats?.pending_reminders || 0}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
  },
  greeting: {
    fontSize: 14,
    color: '#6B7280',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 4,
  },
  logoutButton: {
    padding: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  statCard: {
    width: '48%',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 4,
    opacity: 0.9,
  },
  statSubtext: {
    fontSize: 11,
    color: '#FFFFFF',
    marginTop: 2,
    opacity: 0.7,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  overviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  overviewLabel: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 12,
  },
  overviewValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
});