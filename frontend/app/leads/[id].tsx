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

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams();
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLead();
  }, [id]);

  const loadLead = async () => {
    try {
      const data = await api.getLead(String(id));
      setLead(data);
    } catch (error) {
      console.error('Failed to load lead:', error);
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const handleCall = () => {
    if (lead?.phone) {
      Linking.openURL(`tel:${lead.phone}`);
    }
  };

  const handleWhatsApp = () => {
    if (lead?.phone) {
      const cleanPhone = String(lead.phone).replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${cleanPhone}`);
    }
  };

  const handleEmail = () => {
    if (lead?.email) {
      Linking.openURL(`mailto:${lead.email}`);
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
            } catch (error) {
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
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!lead) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Lead not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getTypeLabel = (type: string) => {
    if (!type) return 'Unknown';
    return String(type).charAt(0).toUpperCase() + String(type).slice(1);
  };

  const formatBudget = () => {
    const min = lead.budget_min ? Number(lead.budget_min).toLocaleString() : '0';
    const max = lead.budget_max ? Number(lead.budget_max).toLocaleString() : '0';
    return `₹${min} - ₹${max}`;
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.headerCard}>
        <Text style={styles.leadName}>{String(lead.name || 'Unknown')}</Text>
        <View style={styles.badges}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{getTypeLabel(lead.lead_type)}</Text>
          </View>
          {lead.lead_temperature && (
            <View style={styles.temperatureBadge}>
              <Text style={styles.temperatureText}>{String(lead.lead_temperature)}</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {lead.phone && (
            <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
              <Ionicons name="call" size={24} color="#3B82F6" />
              <Text style={styles.actionButtonText}>Call</Text>
            </TouchableOpacity>
          )}
          {lead.phone && (
            <TouchableOpacity style={styles.actionButton} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
              <Text style={styles.actionButtonText}>WhatsApp</Text>
            </TouchableOpacity>
          )}
          {lead.email && (
            <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
              <Ionicons name="mail" size={24} color="#6B7280" />
              <Text style={styles.actionButtonText}>Email</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        
        {lead.phone && (
          <View style={styles.detailRow}>
            <Ionicons name="call" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Phone</Text>
            <Text style={styles.detailValue}>{String(lead.phone)}</Text>
          </View>
        )}

        {lead.email && (
          <View style={styles.detailRow}>
            <Ionicons name="mail" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{String(lead.email)}</Text>
          </View>
        )}

        {lead.location && (
          <View style={styles.detailRow}>
            <Ionicons name="location" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{String(lead.location)}</Text>
          </View>
        )}

        {lead.address && (
          <View style={styles.detailRow}>
            <Ionicons name="home" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Address</Text>
            <Text style={styles.detailValue}>{String(lead.address)}</Text>
          </View>
        )}
      </View>

      {/* Property Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Property Details</Text>

        {lead.property_type && (
          <View style={styles.detailRow}>
            <Ionicons name="business" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Type</Text>
            <Text style={styles.detailValue}>{String(lead.property_type)}</Text>
          </View>
        )}

        {lead.bhk && (
          <View style={styles.detailRow}>
            <Ionicons name="bed" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>BHK</Text>
            <Text style={styles.detailValue}>{String(lead.bhk)}</Text>
          </View>
        )}

        {(lead.budget_min || lead.budget_max) && (
          <View style={styles.detailRow}>
            <Ionicons name="cash" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Budget</Text>
            <Text style={styles.detailValue}>{formatBudget()}</Text>
          </View>
        )}

        <View style={styles.detailRow}>
          <Ionicons name="flag" size={20} color="#6B7280" />
          <Text style={styles.detailLabel}>Status</Text>
          <Text style={styles.detailValue}>{String(lead.lead_status || 'New')}</Text>
        </View>
      </View>

      {/* Circle Value */}
      {lead.calculations?.circle_values && Array.isArray(lead.calculations.circle_values) && lead.calculations.circle_values.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Circle Value (approx)</Text>
          {lead.calculations.circle_values.map((cv: any, index: number) => (
            <View style={styles.calcRow} key={String(index)}>
              <View style={styles.calcLabelWrap}>
                <Text style={styles.calcLabel}>{String(cv.label || '')}:</Text>
                <Text style={styles.calcPercent}>({String(cv.percent || 0)}%)</Text>
              </View>
              <Text style={styles.calcValue}>₹{Number(cv.value || 0).toFixed(2)} Cr</Text>
            </View>
          ))}
        </View>
      )}

      {/* Floor Pricing */}
      {lead.calculations?.floor_pricing && typeof lead.calculations.floor_pricing === 'object' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Floors & Pricing</Text>
          {Object.entries(lead.calculations.floor_pricing).map(([floor, price]: [string, any]) => (
            <View style={styles.calcRow} key={String(floor)}>
              <Text style={styles.calcLabel}>{String(floor)}</Text>
              <Text style={styles.calcValue}>₹{Number(price || 0).toFixed(2)} Cr</Text>
            </View>
          ))}
        </View>
      )}

      {/* Plot Specs */}
      {lead.calculations?.plot_specifications && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plot Size Specification</Text>
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Total Built-up:</Text>
            <Text style={styles.calcValue}>
              {Number(lead.calculations.plot_specifications.total_builtup || 0).toLocaleString()} sq.ft
            </Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Per Floor Built-up:</Text>
            <Text style={styles.calcValue}>
              {Number(lead.calculations.plot_specifications.per_floor_builtup || 0).toLocaleString()} sq.ft
            </Text>
          </View>
          <Text style={styles.specNote}>(Balcony Excluded)</Text>
        </View>
      )}

      {/* Notes */}
      {lead.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{String(lead.notes)}</Text>
        </View>
      )}

      {/* Delete */}
      <View style={styles.bottomActions}>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Ionicons name="trash" size={20} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>Delete Lead</Text>
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
    gap: 8,
    marginBottom: 16,
  },
  typeBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
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
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 12,
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
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  calcLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calcLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  calcPercent: {
    fontSize: 12,
    color: '#6B7280',
  },
  calcValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },
  specNote: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 8,
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
    gap: 8,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
