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

interface Lead {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  lead_type: string | null;
  lead_temperature: string | null;
  lead_status: string | null;
  location: string | null;
  address: string | null;
  bhk: string | null;
  budget_min: number | null;
  budget_max: number | null;
  property_type: string | null;
  notes: string | null;
  builder_id: number | null;
  created_at: string;
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLead();
  }, [id]);

  const loadLead = async () => {
    try {
      const data = await api.getLead(id as string);
      setLead(data);
    } catch (error) {
      console.error('Failed to load lead:', error);
      Alert.alert('Error', 'Failed to load lead details');
    } finally {
      setLoading(false);
    }
  };

  const getTemperatureColor = (temp: string | null) => {
    switch (temp) {
      case 'Hot':
        return '#EF4444';
      case 'Warm':
        return '#F59E0B';
      case 'Cold':
        return '#6366F1';
      default:
        return '#9CA3AF';
    }
  };

  const getTypeColor = (type: string | null) => {
    switch (type) {
      case 'buyer':
      case 'tenant':
        return '#3B82F6';
      case 'seller':
      case 'landlord':
      case 'builder':
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  const getTypeLabel = (type: string | null) => {
    if (!type) return 'Unknown';
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const handleCall = () => {
    if (lead?.phone) {
      Linking.openURL(`tel:${lead.phone}`);
    }
  };

  const handleEmail = () => {
    if (lead?.email) {
      Linking.openURL(`mailto:${lead.email}`);
    }
  };

  const handleWhatsApp = () => {
    if (lead?.phone) {
      const cleanPhone = lead.phone.replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${cleanPhone}`);
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
              await api.deleteLead(id as string);
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
        <Text style={styles.loadingText}>Loading lead details...</Text>
      </View>
    );
  }

  if (!lead) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#EF4444" />
        <Text style={styles.errorText}>Lead not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.nameSection}>
          <Text style={styles.leadName}>{lead.name}</Text>
          <View style={styles.badges}>
            <View style={[styles.typeBadge, { backgroundColor: getTypeColor(lead.lead_type) + '20' }]}>
              <Text style={[styles.typeBadgeText, { color: getTypeColor(lead.lead_type) }]}>
                {getTypeLabel(lead.lead_type)}
              </Text>
            </View>
            <View
              style={[
                styles.temperatureBadge,
                { backgroundColor: getTemperatureColor(lead.lead_temperature) },
              ]}
            >
              <Text style={styles.temperatureText}>{lead.lead_temperature || 'N/A'}</Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          {lead.phone && (
            <>
              <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
                <Ionicons name="call" size={24} color="#3B82F6" />
                <Text style={styles.actionButtonText}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionButton} onPress={handleWhatsApp}>
                <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
                <Text style={styles.actionButtonText}>WhatsApp</Text>
              </TouchableOpacity>
            </>
          )}
          {lead.email && (
            <TouchableOpacity style={styles.actionButton} onPress={handleEmail}>
              <Ionicons name="mail" size={24} color="#6B7280" />
              <Text style={styles.actionButtonText}>Email</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Contact Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contact Information</Text>
        
        {lead.phone && (
          <View style={styles.detailRow}>
            <Ionicons name="call" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Phone</Text>
            <Text style={styles.detailValue}>{lead.phone}</Text>
          </View>
        )}

        {lead.email && (
          <View style={styles.detailRow}>
            <Ionicons name="mail" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Email</Text>
            <Text style={styles.detailValue}>{lead.email}</Text>
          </View>
        )}

        {lead.location && (
          <View style={styles.detailRow}>
            <Ionicons name="location" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Location</Text>
            <Text style={styles.detailValue}>{lead.location}</Text>
          </View>
        )}

        {lead.address && (
          <View style={styles.detailRow}>
            <Ionicons name="home" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Address</Text>
            <Text style={styles.detailValue}>{lead.address}</Text>
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
            <Text style={styles.detailValue}>{lead.property_type}</Text>
          </View>
        )}

        {lead.bhk && (
          <View style={styles.detailRow}>
            <Ionicons name="bed" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>BHK</Text>
            <Text style={styles.detailValue}>{lead.bhk}</Text>
          </View>
        )}

        {(lead.budget_min || lead.budget_max) && (
          <View style={styles.detailRow}>
            <Ionicons name="cash" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>Budget</Text>
            <Text style={styles.detailValue}>
              ₹{lead.budget_min?.toLocaleString() || '0'} - ₹{lead.budget_max?.toLocaleString() || '0'}
            </Text>
          </View>
        )}

        <View style={styles.detailRow}>
          <Ionicons name="flag" size={20} color="#6B7280" />
          <Text style={styles.detailLabel}>Status</Text>
          <Text style={styles.detailValue}>{lead.lead_status || 'New'}</Text>
        </View>
      </View>

      {/* Notes */}
      {lead.notes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={styles.notesText}>{lead.notes}</Text>
        </View>
      )}

      {/* Action Buttons */}
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
  nameSection: {
    marginBottom: 16,
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
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  typeBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  temperatureBadge: {
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
