import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { notificationService } from '../../services/notificationService';
import { canViewSensitiveData } from '../../constants/leadOptions';
import { colors, radii, shadows } from '../../constants/theme';

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
  uncontacted_new_leads: number;
  today_site_visits: number;
  stale_leads: number;
  available_inventory: number;
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
  created_by?: number | null;
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

interface DashboardPlotPricing {
  id: number;
  plot_size: number;
  min_price: number;
  max_price: number;
  floors?: { floor_label: string; tentative_floor_price: string }[];
}

interface DashboardLocationPricing {
  location_id: number;
  location_name: string;
  colony_category: string;
  circle_rate: number | string;
  plots: DashboardPlotPricing[];
}

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [urgentFollowups, setUrgentFollowups] = useState<UrgentFollowup[]>([]);
  const [smartMatches, setSmartMatches] = useState<SmartMatch[]>([]);
  const [pricingData, setPricingData] = useState<DashboardLocationPricing[]>([]);
  const [pricingSearch, setPricingSearch] = useState('');
  const [expandedPricingLocationId, setExpandedPricingLocationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [statsData, followupsData, matchesData, pricingRows] = await Promise.all([
        api.getDashboardStats(),
        api.getUrgentFollowups(5).catch(() => []),
        api.getSmartMatches(3).catch(() => []),
        api.getAllPricing().catch(() => []),
      ]);
      setStats(statsData);
      setUrgentFollowups(followupsData);
      setSmartMatches(matchesData);
      setPricingData(Array.isArray(pricingRows) ? pricingRows : []);
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

  useEffect(() => {
    notificationService.requestPermissions();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCall = (phone: string) => {
    if (phone) {
      Linking.openURL(`tel:${phone}`);
    }
  };

  const handleWhatsApp = async (phone: string, name: string, leadId?: number) => {
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
      const message = `Hi ${name}, `;
      await api.sendWhatsApp({
        phone,
        message,
        lead_id: leadId ? String(leadId) : undefined,
        status: 'opened',
        source: 'ios_dashboard',
      }).catch((error) => console.warn('WhatsApp log failed:', error));
      Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(message)}`);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading Dashboard...</Text>
      </View>
    );
  }

  const funnelTotal = (stats?.new_leads || 0) + (stats?.contacted_leads || 0) + (stats?.qualified_leads || 0) + (stats?.negotiating_leads || 0) + (stats?.won_leads || 0);
  const filteredPricingRows = pricingData
    .filter((item) => item.location_name.toLowerCase().includes(pricingSearch.trim().toLowerCase()))
    .slice(0, 5);

  const getPricingRange = (plots: DashboardPlotPricing[]) => {
    if (!plots.length) return 'No plots';
    const min = Math.min(...plots.map((plot) => Number(plot.min_price) || 0).filter((value) => value > 0));
    const max = Math.max(...plots.map((plot) => Number(plot.max_price) || 0).filter((value) => value > 0));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 'Price n/a';
    return `₹${min} - ${max} CR`;
  };

  const getFloorCount = (plots: DashboardPlotPricing[]) =>
    plots.reduce((sum, plot) => sum + (Array.isArray(plot.floors) ? plot.floors.length : 0), 0);

  const togglePricingLocation = (locationId: number) => {
    setExpandedPricingLocationId((current) => current === locationId ? null : locationId);
  };

  const todayWorkItems = [
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
      key: 'missed',
      title: 'Missed follow-ups',
      count: stats?.missed_followups || 0,
      icon: 'alert-circle',
      color: '#DC2626',
      bg: '#FEF2F2',
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
      key: 'untouched',
      title: 'New untouched',
      count: stats?.uncontacted_new_leads || 0,
      icon: 'person-add',
      color: '#7C3AED',
      bg: '#F5F3FF',
      route: '/clients',
    },
    {
      key: 'visits',
      title: 'Site visits',
      count: stats?.today_site_visits || 0,
      icon: 'walk',
      color: '#0F766E',
      bg: '#F0FDFA',
      route: '/more',
    },
    {
      key: 'stale',
      title: 'Stale leads',
      count: stats?.stale_leads || 0,
      icon: 'time',
      color: '#9333EA',
      bg: '#FAF5FF',
      route: '/clients',
    },
    {
      key: 'available',
      title: 'Available inventory',
      count: stats?.available_inventory || 0,
      icon: 'home',
      color: '#047857',
      bg: '#ECFDF5',
      route: '/inventory',
    },
    {
      key: 'matches',
      title: 'Smart matches',
      count: smartMatches.length,
      icon: 'sparkles',
      color: colors.primary,
      bg: colors.primarySoft,
      route: smartMatches[0] ? `/leads/${smartMatches[0].inventory_id}` : '/inventory',
    },
    {
      key: 'pricing',
      title: 'Plot pricing',
      count: '₹',
      icon: 'calculator',
      color: '#A16207',
      bg: '#FFFBEB',
      route: '/pricing',
    },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafeArea}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName}>{user?.full_name || user?.username || 'User'}</Text>
          </View>
          <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
            <Ionicons name="log-out-outline" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.overviewWidget}>
          <TouchableOpacity style={styles.overviewItem} onPress={() => router.push('/clients' as any)}>
            <Text style={styles.overviewValue}>{stats?.client_leads || 0}</Text>
            <Text style={styles.overviewLabel}>Clients</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.overviewItem} onPress={() => router.push('/inventory' as any)}>
            <Text style={styles.overviewValue}>{stats?.inventory_leads || 0}</Text>
            <Text style={styles.overviewLabel}>Inventory</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.overviewItem} onPress={() => router.push('/builders' as any)}>
            <Text style={styles.overviewValue}>{stats?.total_builders || 0}</Text>
            <Text style={styles.overviewLabel}>Builders</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.healthWidget}>
          <View style={styles.healthHeader}>
            <Text style={styles.widgetTitle}>Business Health</Text>
            <Ionicons name="pulse" size={18} color={colors.accent} />
          </View>
          <View style={styles.healthRows}>
            <View style={styles.healthRow}>
              <Text style={styles.healthLabel}>Active follow-ups</Text>
              <Text style={styles.healthValue}>{stats?.pending_reminders || 0}</Text>
            </View>
            <View style={styles.healthRow}>
              <Text style={styles.healthLabel}>Available inventory</Text>
              <Text style={styles.healthValue}>{stats?.available_inventory || 0}</Text>
            </View>
            <View style={styles.healthRow}>
              <Text style={styles.healthLabel}>Weekly conversions</Text>
              <Text style={styles.healthValue}>{stats?.leads_converted_this_week || 0}</Text>
            </View>
          </View>
        </View>

        <View style={styles.pricingWidget}>
          <View style={styles.pricingWidgetHeader}>
            <View>
              <Text style={styles.pricingWidgetTitle}>Plot & Floor Pricing</Text>
              <Text style={styles.pricingWidgetSubtitle}>Latest location-wise price ranges</Text>
            </View>
            <TouchableOpacity style={styles.pricingWidgetAction} onPress={() => router.push('/pricing' as any)}>
              <Ionicons name="open-outline" size={18} color={colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.pricingSearchBox}>
            <Ionicons name="search" size={17} color={colors.inkMuted} />
            <TextInput
              style={styles.pricingSearchInput}
              value={pricingSearch}
              onChangeText={setPricingSearch}
              placeholder="Search location"
              placeholderTextColor={colors.inkMuted}
            />
            {pricingSearch.length > 0 && (
              <TouchableOpacity onPress={() => setPricingSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.pricingTable}>
            <View style={styles.pricingTableHeader}>
              <Text style={[styles.pricingTableHeadText, styles.pricingLocationCell]}>Location</Text>
              <Text style={[styles.pricingTableHeadText, styles.pricingPlotsCell]}>Plots</Text>
              <Text style={[styles.pricingTableHeadText, styles.pricingRangeCell]}>Range</Text>
            </View>
            {filteredPricingRows.length > 0 ? (
              filteredPricingRows.map((item) => {
                const isExpanded = expandedPricingLocationId === item.location_id;

                return (
                  <View key={item.location_id} style={styles.pricingLocationGroup}>
                    <TouchableOpacity
                      style={[styles.pricingTableRow, isExpanded && styles.pricingTableRowExpanded]}
                      onPress={() => togglePricingLocation(item.location_id)}
                    >
                      <View style={styles.pricingLocationCell}>
                        <Text style={styles.pricingLocationName} numberOfLines={1}>{item.location_name}</Text>
                        <Text style={styles.pricingLocationMeta} numberOfLines={1}>{item.colony_category || 'N/A'} Category</Text>
                      </View>
                      <View style={styles.pricingPlotsCell}>
                        <Text style={styles.pricingPlotCount}>{item.plots.length}</Text>
                        <Text style={styles.pricingFloorCount}>{getFloorCount(item.plots)} floors</Text>
                      </View>
                      <View style={[styles.pricingRangeCell, styles.pricingRangeBox]}>
                        <Text style={styles.pricingRangeValue} numberOfLines={1}>{getPricingRange(item.plots)}</Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-up' : 'chevron-down'}
                          size={15}
                          color={colors.inkMuted}
                          style={styles.pricingExpandIcon}
                        />
                      </View>
                    </TouchableOpacity>

                    {isExpanded && (
                      <View style={styles.pricingFloorPanel}>
                        {item.plots.map((plot) => (
                          <View key={plot.id} style={styles.pricingPlotDetail}>
                            <View style={styles.pricingPlotDetailHeader}>
                              <Text style={styles.pricingPlotSize}>{plot.plot_size} sq yds</Text>
                              <Text style={styles.pricingPlotRange}>₹{plot.min_price} - {plot.max_price} CR</Text>
                            </View>
                            {plot.floors && plot.floors.length > 0 ? (
                              plot.floors.map((floor, index) => (
                                <View key={`${plot.id}-${floor.floor_label}-${index}`} style={styles.pricingFloorDetailRow}>
                                  <Text style={styles.pricingFloorLabel} numberOfLines={1}>{floor.floor_label}</Text>
                                  <Text style={styles.pricingFloorPrice}>₹{floor.tentative_floor_price} CR</Text>
                                </View>
                              ))
                            ) : (
                              <Text style={styles.pricingNoFloorText}>No floor pricing added.</Text>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View style={styles.pricingEmptyRow}>
                <Text style={styles.pricingEmptyText}>No pricing records found</Text>
              </View>
            )}
          </View>
        </View>

        {/* Work Today */}
        <View style={styles.todayWorkWidget}>
          <View style={styles.todayWorkHeader}>
            <View>
              <Text style={styles.todayWorkTitle}>Work Today</Text>
              <Text style={styles.todayWorkSubtitle}>Start with the leads most likely to need action.</Text>
            </View>
            <View style={styles.todayWorkHeaderActions}>
              <TouchableOpacity style={styles.todayWorkOpen} onPress={() => router.push('/workbench' as any)}>
                <Ionicons name="briefcase-outline" size={16} color={colors.white} />
                <Text style={styles.todayWorkOpenText}>Open</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.todayWorkRefresh} onPress={onRefresh}>
                <Ionicons name="refresh" size={18} color="#3B82F6" />
              </TouchableOpacity>
            </View>
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
                {canViewSensitiveData(user?.role, user?.id, urgentFollowups[0].created_by) && urgentFollowups[0].lead_phone && (
                  <>
                    <TouchableOpacity style={styles.nextActionButton} onPress={() => handleCall(urgentFollowups[0].lead_phone)}>
                      <Ionicons name="call" size={18} color="#10B981" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.nextActionButton} onPress={() => handleWhatsApp(urgentFollowups[0].lead_phone, urgentFollowups[0].lead_name, urgentFollowups[0].lead_id)}>
                      <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                    </TouchableOpacity>
                  </>
                )}
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
            {urgentFollowups.slice(0, 3).map((followup) => {
              const canView = canViewSensitiveData(user?.role, user?.id, followup.created_by);
              return (
                <View key={followup.id} style={[styles.urgentItem, followup.is_missed && styles.missedItem]}>
                  <View style={styles.urgentItemContent}>
                    <Text style={styles.urgentItemName}>{followup.lead_name}</Text>
                    <Text style={styles.urgentItemTitle}>{followup.title}</Text>
                    <Text style={[styles.urgentItemStatus, followup.is_missed ? styles.missedText : styles.todayText]}>
                      {followup.status} • {followup.due_date} {followup.due_time ? `at ${followup.due_time.slice(0, 5)}` : ''}
                    </Text>
                  </View>
                  <View style={styles.urgentActions}>
                    {canView && followup.lead_phone && (
                      <>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => handleCall(followup.lead_phone)}>
                          <Ionicons name="call" size={18} color="#10B981" />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={() => handleWhatsApp(followup.lead_phone, followup.lead_name, followup.lead_id)}>
                          <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </View>
              );
            })}
            <TouchableOpacity style={styles.viewAllBtn} onPress={() => router.push('/reminders' as any)}>
              <Text style={styles.viewAllText}>View All Follow-ups</Text>
              <Ionicons name="chevron-forward" size={16} color="#3B82F6" />
            </TouchableOpacity>
          </View>
        )}

        {/* Weekly Performance */}
        <View style={styles.performanceWidget}>
          <Text style={styles.widgetTitle}>Weekly Performance</Text>
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
          <Text style={styles.widgetTitle}>Client Lead Funnel</Text>
          <View style={styles.funnelContainer}>
            {[
              { label: 'New', value: stats?.new_leads || 0, color: '#6366F1' },
              { label: 'Contacted', value: stats?.contacted_leads || 0, color: '#8B5CF6' },
              { label: 'Qualified', value: stats?.qualified_leads || 0, color: '#EC4899' },
              { label: 'Negotiating', value: stats?.negotiating_leads || 0, color: '#F59E0B' },
              { label: 'Won', value: stats?.won_leads || 0, color: '#10B981' },
            ].map((stage, index) => (
              <View key={stage.label} style={styles.funnelStage}>
                <View style={styles.funnelBarTrack}>
                  <View style={[styles.funnelBar, { backgroundColor: stage.color, width: `${Math.max(18, funnelTotal > 0 ? (stage.value / funnelTotal) * 100 : 18)}%` }]}>
                    <Text style={styles.funnelValue}>{stage.value}</Text>
                  </View>
                </View>
                <Text style={styles.funnelLabel} numberOfLines={1}>{stage.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* AI Smart Matches */}
        {smartMatches.length > 0 && (
          <View style={styles.matchWidget}>
            <View style={styles.matchHeader}>
              <Text style={styles.widgetTitle}>Smart Matches</Text>
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
            <TouchableOpacity style={styles.actionCard} onPress={() => router.push('/pricing' as any)}>
              <Ionicons name="calculator" size={24} color="#A16207" />
              <Text style={styles.actionText}>Plot Pricing</Text>
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
    backgroundColor: colors.background,
  },
  headerSafeArea: {
    backgroundColor: colors.primary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
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
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.primary,
  },
  greeting: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.white,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  overviewWidget: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  overviewItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  overviewValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
  },
  overviewLabel: {
    fontSize: 11,
    color: colors.inkMuted,
    marginTop: 2,
  },
  healthWidget: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  healthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  healthRows: {
    marginTop: 4,
  },
  healthRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  healthLabel: {
    fontSize: 13,
    color: colors.inkMuted,
  },
  healthValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  pricingWidget: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  pricingWidgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  pricingWidgetSubtitle: {
    color: colors.inkMuted,
    fontSize: 12,
    marginTop: 3,
  },
  pricingWidgetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  pricingWidgetAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pricingSearchBox: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  pricingSearchInput: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    paddingVertical: 9,
  },
  pricingTable: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  pricingTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pricingTableHeadText: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pricingTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pricingTableRowExpanded: {
    backgroundColor: '#FFFBEB',
  },
  pricingLocationGroup: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pricingLocationCell: {
    flex: 1.4,
    minWidth: 0,
    paddingRight: 8,
  },
  pricingPlotsCell: {
    flex: 0.65,
    minWidth: 62,
    paddingRight: 8,
  },
  pricingRangeCell: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
  },
  pricingRangeBox: {
    alignItems: 'flex-end',
  },
  pricingLocationName: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  pricingLocationMeta: {
    color: colors.inkMuted,
    fontSize: 11,
    marginTop: 2,
  },
  pricingPlotCount: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '900',
  },
  pricingFloorCount: {
    color: colors.inkMuted,
    fontSize: 10,
    marginTop: 1,
  },
  pricingRangeValue: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  pricingExpandIcon: {
    marginTop: 2,
  },
  pricingFloorPanel: {
    backgroundColor: '#FFFDF7',
    padding: 10,
  },
  pricingPlotDetail: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 10,
    marginBottom: 8,
  },
  pricingPlotDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pricingPlotSize: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  pricingPlotRange: {
    color: '#A16207',
    fontSize: 12,
    fontWeight: '900',
  },
  pricingFloorDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 6,
  },
  pricingFloorLabel: {
    color: colors.ink,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
  },
  pricingFloorPrice: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  pricingNoFloorText: {
    color: colors.inkMuted,
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 4,
  },
  pricingEmptyRow: {
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    minHeight: 58,
    justifyContent: 'center',
    padding: 12,
  },
  pricingEmptyText: {
    color: colors.inkMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  // Urgent Followups Widget
  urgentWidget: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: colors.danger,
    ...shadows.card,
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
    color: colors.danger,
  },
  urgentBadge: {
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  urgentBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  urgentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  missedItem: {
    backgroundColor: colors.dangerSoft,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  urgentItemContent: {
    flex: 1,
  },
  urgentItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  urgentItemTitle: {
    fontSize: 13,
    color: colors.inkMuted,
    marginTop: 2,
  },
  urgentItemStatus: {
    fontSize: 12,
    marginTop: 4,
  },
  missedText: {
    color: colors.danger,
    fontWeight: '600',
  },
  todayText: {
    color: colors.amber,
    fontWeight: '600',
  },
  urgentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    backgroundColor: colors.surfaceMuted,
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
    color: colors.primary,
  },
  // Work Today
  todayWorkWidget: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  todayWorkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  todayWorkHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayWorkOpen: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  todayWorkOpenText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  todayWorkTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
  },
  todayWorkSubtitle: {
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 3,
  },
  todayWorkRefresh: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
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
    borderRadius: radii.md,
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
    color: colors.ink,
    fontWeight: '600',
    marginTop: 2,
  },
  nextActionPanel: {
    marginTop: 14,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
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
    color: colors.inkMuted,
    textTransform: 'uppercase',
  },
  nextActionName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 3,
  },
  nextActionTitle: {
    fontSize: 12,
    color: colors.inkMuted,
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
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextActionCta: {
    backgroundColor: colors.primary,
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
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  widgetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
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
    color: colors.primary,
  },
  performanceLabel: {
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 4,
  },
  // Funnel Widget
  funnelWidget: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  funnelContainer: {
    gap: 10,
  },
  funnelStage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  funnelBarTrack: {
    flex: 1,
    minWidth: 0,
  },
  funnelBar: {
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 36,
  },
  funnelValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  funnelLabel: {
    width: 76,
    fontSize: 11,
    color: colors.inkMuted,
    flexShrink: 0,
  },
  // Match Widget
  matchWidget: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    marginBottom: 16,
    ...shadows.card,
  },
  matchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiBadge: {
    backgroundColor: colors.purpleSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.purple,
  },
  matchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    padding: 12,
    borderRadius: radii.md,
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
    color: colors.primary,
  },
  matchInventoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
    maxWidth: 120,
  },
  matchLocation: {
    fontSize: 12,
    color: colors.inkMuted,
    marginTop: 4,
  },
  matchReasons: {
    marginTop: 6,
  },
  matchReason: {
    fontSize: 11,
    color: colors.accent,
  },
  matchScore: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.sm,
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
    borderRadius: radii.lg,
    position: 'relative',
    ...shadows.card,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 13,
    color: colors.inkMuted,
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
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.lg,
    padding: 16,
    ...shadows.card,
  },
  quickActionsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: '47%',
    backgroundColor: colors.surfaceMuted,
    padding: 16,
    borderRadius: radii.md,
    alignItems: 'center',
    gap: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
});
