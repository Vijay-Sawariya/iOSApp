import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';

interface DashboardStats {
  total_leads: number;
  client_leads: number;
  inventory_leads: number;
  hot_leads: number;
  warm_leads: number;
  cold_leads: number;
  total_builders: number;
  today_reminders: number;
  pending_reminders: number;
  missed_followups: number;
  upcoming_followups: number;
  leads_this_week: number;
  followups_completed_this_week: number;
  leads_converted_this_week: number;
  new_leads: number;
  contacted_leads: number;
  qualified_leads: number;
  negotiating_leads: number;
  won_leads: number;
}

interface UrgentFollowup {
  id: number;
  lead_id: number;
  lead_name: string;
  lead_phone: string;
  lead_type: string;
  title: string;
  due_date: string;
  due_time: string;
  status: string;
  is_missed: boolean;
}

interface SmartMatch {
  buyer_id: number;
  buyer_name: string;
  inventory_id: number;
  inventory_name: string;
  location: string;
  match_score: number;
  match_reasons: string[];
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [urgentFollowups, setUrgentFollowups] = useState<UrgentFollowup[]>([]);
  const [smartMatches, setSmartMatches] = useState<SmartMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [statsData, followupsData, matchesData] = await Promise.all([
        api.getDashboardStats(),
        api.getUrgentFollowups(5).catch(() => []),
        api.getSmartMatches(3).catch(() => []),
      ]);
      setStats(statsData);
      setUrgentFollowups(followupsData);
      setSmartMatches(matchesData);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCall = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleWhatsApp = (phone: string, name: string) => {
    if (phone) {
      const message = `Hi ${name}, `;
      Linking.openURL(`whatsapp://send?phone=91${phone.replace(/\D/g, '')}&text=${encodeURIComponent(message)}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  const funnelTotal = (stats?.new_leads || 0) + (stats?.contacted_leads || 0) + (stats?.qualified_leads || 0) + (stats?.negotiating_leads || 0) + (stats?.won_leads || 0);
  const todayWorkItems = [
    {
      key: 'missed',
      title: 'Missed follow-ups',
      count: stats?.missed_followups || 0,
      icon: 'alert-circle',
      color: '#DC2626',
      bg: '#FEF2F2',
      route: '/reminders',
    },
    {
      key: 'today',
      title: 'Due today',
      count: stats?.today_reminders || urgentFollowups.filter((item) => !item.is_missed).length || 0,
      icon: 'today',
      color: '#D97706',
      bg: '#FFFBEB',
      route: '/reminders',
    },
    {
      key: 'hot',
      title: 'Hot leads',
      count: stats?.hot_leads || 0,
      icon: 'flame',
      color: '#EF4444',
      bg: '#FFF1F2',
      route: '/clients',
    },
    {
      key: 'matches',
      title: 'Smart matches',
      count: smartMatches.length,
      icon: 'sparkles',
      color: '#2563EB',
      bg: '#EFF6FF',
      route: smartMatches[0] ? `/leads/${smartMatches[0].inventory_id}` : '/inventory',
    },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.full_name || user?.username || 'User'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Work Today */}
        <View style={styles.todayWorkWidget}>
          <View style={styles.todayWorkHeader}>
            <View>
              <Text style={styles.todayWorkTitle}>Work Today</Text>
              <Text style={styles.todayWorkSubtitle}>Start with the leads most likely to need action.</Text>
            </View>
            <TouchableOpacity style={styles.todayWorkRefresh} onPress={onRefresh}>
              <Ionicons name="refresh" size={18} color="#3B82F6" />
            </TouchableOpacity>
          </View>

          <View style={styles.todayWorkGrid}>
            {todayWorkItems.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={[styles.todayWorkCard, { backgroundColor: item.bg }]}
                onPress={() => router.push(item.route as any)}
              >
                <View style={[styles.todayWorkIcon, { backgroundColor: item.color }]}>
                  <Ionicons name={item.icon as any} size={18} color="#FFFFFF" />
                </View>
                <Text style={[styles.todayWorkCount, { color: item.color }]}>{item.count}</Text>
                <Text style={styles.todayWorkLabel}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {urgentFollowups.length > 0 ? (
            <View style={styles.nextActionPanel}>
              <View style={styles.nextActionCopy}>
                <Text style={styles.nextActionLabel}>Next best action</Text>
                <Text style={styles.nextActionName}>{urgentFollowups[0].lead_name}</Text>
                <Text style={styles.nextActionTitle} numberOfLines={1}>{urgentFollowups[0].title}</Text>
              </View>
              <View style={styles.nextActionButtons}>
                <TouchableOpacity style={styles.nextActionButton} onPress={() => handleCall(urgentFollowups[0].lead_phone)}>
                  <Ionicons name="call" size={18} color="#10B981" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.nextActionButton} onPress={() => handleWhatsApp(urgentFollowups[0].lead_phone, urgentFollowups[0].lead_name)}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.nextActionButton} onPress={() => router.push(`/leads/${urgentFollowups[0].lead_id}` as any)}>
                  <Ionicons name="open-outline" size={18} color="#3B82F6" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.nextActionPanel}>
              <View style={styles.nextActionCopy}>
                <Text style={styles.nextActionLabel}>Next best action</Text>
                <Text style={styles.nextActionName}>No urgent follow-ups</Text>
                <Text style={styles.nextActionTitle}>Review hot leads or add new inventory.</Text>
              </View>
              <TouchableOpacity style={styles.nextActionCta} onPress={() => router.push('/leads/add?type=client' as any)}>
                <Text style={styles.nextActionCtaText}>Add Lead</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Urgent Follow-ups Widget */}
        {urgentFollowups.length > 0 && (
          <View style={styles.urgentWidget}>
            <View style={styles.urgentHeader}>
              <View style={styles.urgentTitleRow}>
                <Ionicons name="warning" size={20} color="#DC2626" />
                <Text style={styles.urgentTitle}>Urgent Follow-ups</Text>
              </View>
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentBadgeText}>{stats?.missed_followups || 0} missed</Text>
              </View>
            </View>
            {urgentFollowups.slice(0, 3).map((followup) => (
              <View key={followup.id} style={[styles.urgentItem, followup.is_missed && styles.missedItem]}>
                <View style={styles.urgentItemContent}>
                  <Text style={styles.urgentItemName}>{followup.lead_name}</Text>
                  <Text style={styles.urgentItemTitle}>{followup.title}</Text>
                  <Text style={[styles.urgentItemStatus, followup.is_missed ? styles.missedText : styles.todayText]}>
                    {followup.status} • {followup.due_date} {followup.due_time ? `at ${followup.due_time.slice(0, 5)}` : ''}
                  </Text>
                </View>
                <View style={styles.urgentActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleCall(followup.lead_phone)}>
                    <Ionicons name="call" size={18} color="#10B981" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleWhatsApp(followup.lead_phone, followup.lead_name)}>
                    <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity style={styles.viewAllBtn} onPress={() => router.push('/reminders' as any)}>
              <Text style={styles.viewAllText}>View All Follow-ups</Text>
              <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Weekly Performance */}
        <View style={styles.performanceWidget}>
          <Text style={styles.widgetTitle}>📊 Weekly Performance</Text>
          <View style={styles.performanceGrid}>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>{stats?.leads_this_week || 0}</Text>
              <Text style={styles.performanceLabel}>Leads Added</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={styles.performanceValue}>{stats?.followups_completed_this_week || 0}</Text>
              <Text style={styles.performanceLabel}>Follow-ups Done</Text>
            </View>
            <View style={styles.performanceItem}>
              <Text style={[styles.performanceValue, { color: '#10B981' }]}>{stats?.leads_converted_this_week || 0}</Text>
              <Text style={styles.performanceLabel}>Deals Won</Text>
            </View>
          </View>
        </View>

        {/* Lead Conversion Funnel */}
        <View style={styles.funnelWidget}>
          <Text style={styles.widgetTitle}>🎯 Client Lead Funnel</Text>
          <View style={styles.funnelContainer}>
            {[
              { label: 'New', value: stats?.new_leads || 0, color: '#6366F1' },
              { label: 'Contacted', value: stats?.contacted_leads || 0, color: '#8B5CF6' },
              { label: 'Qualified', value: stats?.qualified_leads || 0, color: '#EC4899' },
              { label: 'Negotiating', value: stats?.negotiating_leads || 0, color: '#F59E0B' },
              { label: 'Won', value: stats?.won_leads || 0, color: '#10B981' },
            ].map((stage, index) => (
              <View key={stage.label} style={styles.funnelStage}>
                <View style={[styles.funnelBar, { backgroundColor: stage.color, width: `${Math.max(20, funnelTotal > 0 ? (stage.value / funnelTotal) * 100 : 20)}%` }]}>
                  <Text style={styles.funnelValue}>{stage.value}</Text>
                </View>
                <Text style={styles.funnelLabel}>{stage.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* AI Smart Matches */}
        {smartMatches.length > 0 && (
          <View style={styles.matchWidget}>
            <View style={styles.matchHeader}>
              <Text style={styles.widgetTitle}>🤖 AI Smart Matches</Text>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>AI Powered</Text>
              </View>
            </View>
            {smartMatches.map((match, index) => (
              <TouchableOpacity 
                key={`${match.buyer_id}-${match.inventory_id}`} 
                style={styles.matchItem}
                onPress={() => router.push(`/leads/${match.inventory_id}` as any)}
              >
                <View style={styles.matchContent}>
                  <View style={styles.matchNames}>
                    <Text style={styles.matchBuyerName}>{match.buyer_name}</Text>
                    <Ionicons name="arrow-forward" size={14} color="#9CA3AF" />
                    <Text style={styles.matchInventoryName} numberOfLines={1}>{match.inventory_name}</Text>
                  </View>
                  <Text style={styles.matchLocation}>📍 {match.location}</Text>
                  <View style={styles.matchReasons}>
                    {match.match_reasons.slice(0, 2).map((reason, i) => (
                      <Text key={i} style={styles.matchReason}>✓ {reason}</Text>
                    ))}
                  </View>
                </View>
                <View style={[styles.matchScore, { backgroundColor: match.match_score >= 70 ? '#D1FAE5' : match.match_score >= 50 ? '#FEF3C7' : '#E5E7EB' }]}>
                  <Text style={[styles.matchScoreText, { color: match.match_score >= 70 ? '#059669' : match.match_score >= 50 ? '#D97706' : '#6B7280' }]}>
                    {match.match_score}%
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <TouchableOpacity style={[styles.statCard, { backgroundColor: '#FEE2E2' }]} onPress={() => router.push('/clients' as any)}>
            <Text style={[styles.statValue, { color: '#DC2626' }]}>{stats?.hot_leads || 0}</Text>
            <Text style={styles.statLabel}>Hot Leads</Text>
            <Ionicons name="flame" size={20} color="#DC2626" style={styles.statIcon} />
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.statCard, { backgroundColor: '#DBEAFE' }]} onPress={() => router.push('/clients' as any)}>
            <Text style={[styles.statValue, { color: '#2563EB' }]}>{stats?.client_leads || 0}</Text>
            <Text style={styles.statLabel}>Total Clients</Text>
            <Ionicons name="people" size={20} color="#2563EB" style={styles.statIcon} />
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.statCard, { backgroundColor: '#D1FAE5' }]} onPress={() => router.push('/inventory' as any)}>
            <Text style={[styles.statValue, { color: '#059669' }]}>{stats?.inventory_leads || 0}</Text>
            <Text style={styles.statLabel}>Inventory</Text>
            <Ionicons name="home" size={20} color="#059669" style={styles.statIcon} />
          </TouchableOpacity>
          
          <TouchableOpacity style={[styles.statCard, { backgroundColor: '#FEF3C7' }]} onPress={() => router.push('/reminders' as any)}>
            <Text style={[styles.statValue, { color: '#D97706' }]}>{stats?.upcoming_followups || 0}</Text>
            <Text style={styles.statLabel}>Upcoming</Text>
            <Ionicons name="calendar" size={20} color="#D97706" style={styles.statIcon} />
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.quickActionsTitle}>Quick Actions</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/leads/add?type=client' as any)}>
              <Ionicons name="person-add" size={24} color="#3B82F6" />
              <Text style={styles.actionText}>Add Client</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/leads/add?type=inventory' as any)}>
              <Ionicons name="add-circle" size={24} color="#10B981" />
              <Text style={styles.actionText}>Add Inventory</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/clients' as any)}>
              <Ionicons name="people" size={24} color="#8B5CF6" />
              <Text style={styles.actionText}>View Clients</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/inventory' as any)}>
              <Ionicons name="home" size={24} color="#F59E0B" />
              <Text style={styles.actionText}>View Inventory</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: '#FFFFFF',
  },
  greeting: {
    fontSize: 14,
    color: '#6B7280',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1F2937',
  },
  logoutBtn: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  // Urgent Followups Widget
  urgentWidget: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
  },
  urgentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  urgentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  urgentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
  },
  urgentBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  urgentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
  },
  urgentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  missedItem: {
    backgroundColor: '#FEF2F2',
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  urgentItemContent: {
    flex: 1,
  },
  urgentItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  urgentItemTitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  urgentItemStatus: {
    fontSize: 12,
    marginTop: 4,
  },
  missedText: {
    color: '#DC2626',
    fontWeight: '600',
  },
  todayText: {
    color: '#D97706',
    fontWeight: '600',
  },
  urgentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    backgroundColor: '#F3F4F6',
    padding: 10,
    borderRadius: 10,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 4,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  // Work Today
  todayWorkWidget: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  todayWorkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  todayWorkTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  todayWorkSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 3,
  },
  todayWorkRefresh: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayWorkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  todayWorkCard: {
    width: '48%',
    borderRadius: 12,
    padding: 12,
    minHeight: 100,
  },
  todayWorkIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  todayWorkCount: {
    fontSize: 24,
    fontWeight: '800',
  },
  todayWorkLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
    marginTop: 2,
  },
  nextActionPanel: {
    marginTop: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nextActionCopy: {
    flex: 1,
    marginRight: 10,
  },
  nextActionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
  },
  nextActionName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 3,
  },
  nextActionTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  nextActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  nextActionButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionCta: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  nextActionCtaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  // Performance Widget
  performanceWidget: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  widgetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  performanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  performanceItem: {
    alignItems: 'center',
  },
  performanceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#3B82F6',
  },
  performanceLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  // Funnel Widget
  funnelWidget: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  funnelContainer: {
    gap: 10,
  },
  funnelStage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  funnelBar: {
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    paddingHorizontal: 10,
    minWidth: 50,
  },
  funnelValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  funnelLabel: {
    fontSize: 13,
    color: '#6B7280',
    flex: 1,
  },
  // Match Widget
  matchWidget: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6366F1',
  },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  matchContent: {
    flex: 1,
  },
  matchNames: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  matchBuyerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  matchInventoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    maxWidth: 120,
  },
  matchLocation: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  matchReasons: {
    marginTop: 6,
  },
  matchReason: {
    fontSize: 11,
    color: '#059669',
  },
  matchScore: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginLeft: 10,
  },
  matchScoreText: {
    fontSize: 16,
    fontWeight: '700',
  },
  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    width: '47%',
    padding: 16,
    borderRadius: 16,
    position: 'relative',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  statIcon: {
    position: 'absolute',
    top: 16,
    right: 16,
    opacity: 0.6,
  },
  // Quick Actions
  quickActions: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
});
