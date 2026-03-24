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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../../services/api';

// Safe string helper - converts any value to string safely
const safeStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

// Safe number helper
const safeNum = (val: any): number => {
  const num = Number(val);
  return isNaN(num) ? 0 : num;
};

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLead();
  }, [id]);

  const loadLead = async () => {
    try {
      setError(null);
      const data = await api.getLead(String(id));
      console.log('Lead data loaded:', JSON.stringify(data, null, 2));
      setLead(data);
    } catch (err) {
      console.error('Failed to load lead:', err);
      setError('Failed to load lead details');
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const handleCall = () => {
    if (lead?.phone) {
      Linking.openURL(`tel:${safeStr(lead.phone)}`);
    }
  };

  const handleWhatsApp = () => {
    if (lead?.phone) {
      const cleanPhone = safeStr(lead.phone).replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${cleanPhone}`);
    }
  };

  const handleEmail = () => {
    if (lead?.email) {
      Linking.openURL(`mailto:${safeStr(lead.email)}`);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Lead',
      'Are you sure you want to delete this lead?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.deleteLead(String(id));
              Alert.alert('Success', 'Lead deleted successfully');
              router.back();
            } catch (err) {
              Alert.alert('Error', 'Failed to delete lead');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>{'Loading...'}</Text>
      </View>
    );
  }

  if (error || !lead) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Lead not found'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{'Go Back'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getTypeLabel = (type: any): string => {
    if (!type) return 'Unknown';
    const str = safeStr(type);
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const formatBudget = (): string => {
    const min = lead.budget_min ? safeNum(lead.budget_min).toLocaleString() : '0';
    const max = lead.budget_max ? safeNum(lead.budget_max).toLocaleString() : '0';
    return `₹${min} - ₹${max}`;
  };

  const formatUnit = (unit: string | null): string => {
    if (!unit) return '';
    switch (unit.toUpperCase()) {
      case 'CR':
        return 'Cr';
      case 'L':
        return 'L';
      case 'K':
      case 'TH':
        return 'K';
      default:
        return unit;
    }
  };

  const isInventoryLead = (): boolean => {
    const type = safeStr(lead.lead_type).toLowerCase();
    return ['seller', 'landlord', 'builder'].includes(type);
  };

  const isClientLead = (): boolean => {
    const type = safeStr(lead.lead_type).toLowerCase();
    return ['buyer', 'tenant'].includes(type);
  };

  // Render a detail row safely
  const renderDetailRow = (icon: string, label: string, value: any) => {
    const strValue = safeStr(value);
    if (!strValue) return null;
    return (
      <View style={styles.detailRow}>
        <Ionicons name={icon as any} size={20} color="#6B7280" />
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{strValue}</Text>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.leadName}>{safeStr(lead.name) || 'Unknown'}</Text>
        <View style={styles.badges}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{getTypeLabel(lead.lead_type)}</Text>
          </View>
          {lead.lead_temperature ? (
            <View style={styles.temperatureBadge}>
              <Text style={styles.temperatureText}>{safeStr(lead.lead_temperature)}</Text>
            </View>
          ) : null}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {lead.phone ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
              <Ionicons name="call" size={24} color="#3B82F6" />
              <Text style={styles.actionButtonText}>{'Call'}</Text>
            </TouchableOpacity>
          ) : null}
          {lead.phone ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
              <Text style={styles.actionButtonText}>{'WhatsApp'}</Text>
            </TouchableOpacity>
          ) : null}
          {lead.email ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
              <Ionicons name="mail" size={24} color="#6B7280" />
              <Text style={styles.actionButtonText}>{'Email'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{'Contact Information'}</Text>
        {renderDetailRow('call', 'Phone', lead.phone)}
        {renderDetailRow('mail', 'Email', lead.email)}
        {renderDetailRow('location', 'Location', lead.location)}
        {renderDetailRow('home', 'Address', lead.address)}
      </View>

      {/* Property Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{'Property Details'}</Text>
        {renderDetailRow('business', 'Type', lead.property_type)}
        {renderDetailRow('bed', 'BHK', lead.bhk)}
        {renderDetailRow('layers', 'Floor', lead.floor)}
        {renderDetailRow('resize', 'Area Size', lead.area_size ? `${safeStr(lead.area_size)} sq.yds` : null)}
        {renderDetailRow('car', 'Parking', lead.car_parking_number)}
        {renderDetailRow('arrow-up', 'Lift', lead.lift_available)}
        {(lead.budget_min || lead.budget_max) ? (
          <View style={styles.detailRow}>
            <Ionicons name="cash" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>{'Budget'}</Text>
            <Text style={styles.detailValue}>{formatBudget()}</Text>
          </View>
        ) : null}
        <View style={styles.detailRow}>
          <Ionicons name="flag" size={20} color="#6B7280" />
          <Text style={styles.detailLabel}>{'Status'}</Text>
          <Text style={styles.detailValue}>{safeStr(lead.lead_status) || 'New'}</Text>
        </View>
      </View>

      {/* Floor Pricing - For Inventory Leads */}
      {isInventoryLead() && lead.floor_pricing && lead.floor_pricing.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Floor-wise Pricing'}</Text>
          <View style={styles.floorPricingGrid}>
            {lead.floor_pricing.map((fp: any, index: number) => (
              <View key={index} style={styles.floorPricingCard}>
                <Text style={styles.floorLabel}>{safeStr(fp.floor_label)}</Text>
                <Text style={styles.floorPrice}>
                  {`${safeNum(fp.floor_amount)} ${formatUnit(lead.unit)}`}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Client Preferences - For Client Leads */}
      {isClientLead() ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Client Preferences'}</Text>
          {renderDetailRow('layers', 'Preferred Floors', lead.floor)}
          {(lead.budget_min || lead.budget_max) ? (
            <View style={styles.detailRow}>
              <Ionicons name="wallet" size={20} color="#6B7280" />
              <Text style={styles.detailLabel}>{'Expected Budget'}</Text>
              <Text style={styles.detailValue}>{`${formatBudget()} ${formatUnit(lead.unit)}`}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Additional Features */}
      {(lead.park_facing || lead.wide_road || lead.peaceful_location || lead.main_road || lead.corner) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Features'}</Text>
          <View style={styles.featuresGrid}>
            {lead.park_facing ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Park Facing'}</Text></View> : null}
            {lead.wide_road ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Wide Road'}</Text></View> : null}
            {lead.peaceful_location ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Peaceful'}</Text></View> : null}
            {lead.main_road ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Main Road'}</Text></View> : null}
            {lead.corner ? <View style={styles.featureBadge}><Text style={styles.featureText}>{'Corner'}</Text></View> : null}
          </View>
        </View>
      ) : null}

      {/* Notes */}
      {lead.notes ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{'Notes'}</Text>
          <Text style={styles.notesText}>{safeStr(lead.notes)}</Text>
        </View>
      ) : null}

      {/* Delete Button */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>{'Delete Lead'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
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
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#EF4444',
    marginTop: 16,
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  leadName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
  },
  badges: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  typeBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
  },
  typeBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  temperatureBadge: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  temperatureText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  actionButtons: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 12,
    marginRight: 8,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  detailLabel: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 12,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
    textAlign: 'right',
    flex: 1,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  floorPricingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  floorPricingCard: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    marginRight: 12,
    marginBottom: 12,
    minWidth: 100,
    alignItems: 'center',
  },
  floorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#065F46',
    marginBottom: 4,
  },
  floorPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#047857',
  },
  featureBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0369A1',
  },
  notesText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
  },
  bottomActions: {
    padding: 20,
    paddingBottom: 40,
  },
  deleteButton: {
    flexDirection: 'row',
    backgroundColor: '#EF4444',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
