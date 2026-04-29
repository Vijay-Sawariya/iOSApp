import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../../services/api';

// Safe string helper
const safeStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

interface Lead {
  id: number;
  name: string;
  phone: string | null;
  lead_type: string | null;
  lead_status: string | null;
  location: string | null;
  address: string | null;
  area_size: string | null;
  property_type: string | null;
  floor: string | null;
  floor_pricing?: { floor_label: string; floor_amount: number }[];
  unit: string | null;
}

interface Builder {
  id: number;
  builder_name: string;
  company_name: string | null;
  phone: string | null;
  address: string | null;
  created_at: string | null;
}

export default function BuilderDetailScreen() {
  const { id } = useLocalSearchParams();
  const [builder, setBuilder] = useState<Builder | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      setError(null);
      const [builderData, leadsData] = await Promise.all([
        api.getBuilder(String(id)),
        api.getBuilderLeads(String(id)).catch(() => []),
      ]);
      setBuilder(builderData);
      setLeads(leadsData || []);
    } catch (err) {
      console.error('Failed to load builder:', err);
      setError('Failed to load builder details');
      Alert.alert('Error', 'Failed to load builder details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleCall = () => {
    if (builder?.phone) {
      Linking.openURL(`tel:${safeStr(builder.phone)}`);
    }
  };

  const handleWhatsApp = () => {
    if (builder?.phone) {
      const cleanPhone = safeStr(builder.phone).replace(/[^0-9]/g, '');
      const phoneWithCountry = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
      Linking.openURL(`https://wa.me/${phoneWithCountry}`);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Builder',
      'Are you sure you want to delete this builder? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteBuilder(String(id));
              Alert.alert('Success', 'Builder deleted successfully');
              router.back();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete builder');
            }
          },
        },
      ]
    );
  };

  const handleEdit = () => {
    router.push(`/builders/edit/${id}` as any);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatUnit = (unit: string | null): string => {
    if (!unit) return '';
    switch (unit.toUpperCase()) {
      case 'CR': return ' Cr';
      case 'L': return ' L';
      case 'K':
      case 'TH': return ' K';
      default: return ` ${unit}`;
    }
  };

  const formatFloorPricing = (pricing?: { floor_label: string; floor_amount: number }[], unit?: string | null): string => {
    if (!pricing || pricing.length === 0) return '';
    const unitStr = formatUnit(unit);
    return pricing.map(p => `${p.floor_label}: ${p.floor_amount}${unitStr}`).join(' | ');
  };

  const getTypeColor = (type: string | null): { bg: string; text: string } => {
    switch (type) {
      case 'seller': return { bg: '#DCFCE7', text: '#166534' };
      case 'landlord': return { bg: '#FEF3C7', text: '#92400E' };
      case 'builder': return { bg: '#E0E7FF', text: '#3730A3' };
      default: return { bg: '#F3F4F6', text: '#374151' };
    }
  };

  const renderLeadCard = ({ item }: { item: Lead }) => {
    const typeColor = getTypeColor(item.lead_type);
    const floorPricingText = formatFloorPricing(item.floor_pricing, item.unit);
    
    return (
      <TouchableOpacity 
        style={styles.leadCard}
        onPress={() => router.push(`/leads/${item.id}`)}
      >
        <View style={styles.leadHeader}>
          <View style={styles.leadInfo}>
            <Text style={styles.leadName}>{safeStr(item.name)}</Text>
            <View style={[styles.typeBadge, { backgroundColor: typeColor.bg }]}>
              <Text style={[styles.typeText, { color: typeColor.text }]}>
                {item.lead_type === 'seller' ? 'Sell' : item.lead_type === 'landlord' ? 'Rent' : 'Builder'}
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
        </View>
        
        {(item.address || item.location) && (
          <View style={styles.leadDetailRow}>
            <Ionicons name="location-outline" size={14} color="#6B7280" />
            <Text style={styles.leadDetailText} numberOfLines={1}>
              {[item.address, item.location].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}
        
        <View style={styles.leadTags}>
          {item.property_type && (
            <View style={styles.leadTag}>
              <Text style={styles.leadTagText}>{item.property_type}</Text>
            </View>
          )}
          {item.area_size && (
            <View style={styles.leadTag}>
              <Text style={styles.leadTagText}>{item.area_size} sq.yds</Text>
            </View>
          )}
          {item.floor && (
            <View style={styles.leadTag}>
              <Text style={styles.leadTagText}>{item.floor}</Text>
            </View>
          )}
          {item.lead_status && (
            <View style={[styles.leadTag, { backgroundColor: '#D1FAE5' }]}>
              <Text style={[styles.leadTagText, { color: '#059669' }]}>{item.lead_status}</Text>
            </View>
          )}
        </View>
        
        {floorPricingText && (
          <View style={styles.pricingRow}>
            <Ionicons name="cash-outline" size={14} color="#10B981" />
            <Text style={styles.pricingText} numberOfLines={1}>{floorPricingText}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading builder details...</Text>
      </View>
    );
  }

  if (error || !builder) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color="#EF4444" />
        <Text style={styles.errorText}>{error || 'Builder not found'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backIconButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#1F2937" />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconButton} onPress={handleEdit}>
              <Ionicons name="create-outline" size={22} color="#3B82F6" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.builderIconContainer}>
          <Ionicons name="business" size={48} color="#3B82F6" />
        </View>
        
        <Text style={styles.builderName}>{safeStr(builder.builder_name) || 'Unknown Builder'}</Text>
        {builder.company_name && (
          <Text style={styles.companyName}>{safeStr(builder.company_name)}</Text>
        )}

        {/* Quick Action Buttons */}
        <View style={styles.actionButtons}>
          {builder.phone && (
            <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
              <View style={styles.actionIconCircle}>
                <Ionicons name="call" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.actionButtonText}>Call</Text>
            </TouchableOpacity>
          )}
          {builder.phone && (
            <TouchableOpacity style={styles.actionButton} onPress={handleWhatsApp}>
              <View style={[styles.actionIconCircle, { backgroundColor: '#25D366' }]}>
                <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
              </View>
              <Text style={styles.actionButtonText}>WhatsApp</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionButton} onPress={handleEdit}>
            <View style={[styles.actionIconCircle, { backgroundColor: '#8B5CF6' }]}>
              <Ionicons name="create" size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.actionButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats Section */}
      <View style={styles.statsSection}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{leads.length}</Text>
          <Text style={styles.statLabel}>Properties</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {leads.filter(l => l.lead_type === 'seller').length}
          </Text>
          <Text style={styles.statLabel}>For Sale</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>
            {leads.filter(l => l.lead_type === 'landlord').length}
          </Text>
          <Text style={styles.statLabel}>For Rent</Text>
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        
        <View style={styles.infoCard}>
          {builder.phone && (
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="call" size={18} color="#3B82F6" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{safeStr(builder.phone)}</Text>
              </View>
              <TouchableOpacity onPress={handleCall}>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          )}
          
          {builder.address && (
            <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
              <View style={styles.infoIconContainer}>
                <Ionicons name="location" size={18} color="#10B981" />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue}>{safeStr(builder.address)}</Text>
              </View>
            </View>
          )}
          
          {!builder.phone && !builder.address && (
            <View style={styles.emptyInfo}>
              <Text style={styles.emptyInfoText}>No contact information available</Text>
            </View>
          )}
        </View>
      </View>

      {/* Additional Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Additional Details</Text>
        
        <View style={styles.infoCard}>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <View style={styles.infoIconContainer}>
              <Ionicons name="calendar" size={18} color="#F59E0B" />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Added On</Text>
              <Text style={styles.infoValue}>{formatDate(builder.created_at)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Related Properties */}
      {leads.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Properties ({leads.length})</Text>
          </View>
          
          {leads.map((lead) => (
            <View key={lead.id}>
              {renderLeadCard({ item: lead })}
            </View>
          ))}
        </View>
      )}

      {leads.length === 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Properties</Text>
          <View style={styles.emptyProperties}>
            <Ionicons name="home-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyPropertiesText}>No properties linked to this builder</Text>
            <Text style={styles.emptyPropertiesSubtext}>
              Properties will appear here when leads are associated with this builder
            </Text>
          </View>
        </View>
      )}

      {/* Spacing at bottom */}
      <View style={styles.bottomSpacing} />
    </ScrollView>
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
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
    marginTop: 16,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 24,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerCard: {
    backgroundColor: '#FFFFFF',
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTop: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  builderIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 16,
  },
  builderName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    textAlign: 'center',
  },
  companyName: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 24,
    justifyContent: 'center',
  },
  actionButton: {
    alignItems: 'center',
    marginHorizontal: 16,
  },
  actionIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4B5563',
  },
  statsSection: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -12,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  emptyInfo: {
    padding: 24,
    alignItems: 'center',
  },
  emptyInfoText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  leadCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  leadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  leadInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  leadName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginRight: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  typeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  leadDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  leadDetailText: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
    flex: 1,
  },
  leadTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  leadTag: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 4,
  },
  leadTagText: {
    fontSize: 12,
    color: '#374151',
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  pricingText: {
    fontSize: 12,
    color: '#10B981',
    marginLeft: 6,
    flex: 1,
  },
  emptyProperties: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  emptyPropertiesText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptyPropertiesSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
  },
  bottomSpacing: {
    height: 40,
  },
});
