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

// Safe string helper
const safeStr = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

export default function BuilderDetailScreen() {
  const { id } = useLocalSearchParams();
  const [builder, setBuilder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBuilder();
  }, [id]);

  const loadBuilder = async () => {
    try {
      setError(null);
      const data = await api.getBuilder(String(id));
      setBuilder(data);
    } catch (err) {
      console.error('Failed to load builder:', err);
      setError('Failed to load builder details');
      Alert.alert('Error', 'Failed to load builder details');
    } finally {
      setLoading(false);
    }
  };

  const handleCall = () => {
    if (builder?.phone) {
      Linking.openURL(`tel:${safeStr(builder.phone)}`);
    }
  };

  const handleWhatsApp = () => {
    if (builder?.phone) {
      const cleanPhone = safeStr(builder.phone).replace(/[^0-9]/g, '');
      Linking.openURL(`https://wa.me/${cleanPhone}`);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Builder',
      'Are you sure you want to delete this builder?',
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>{'Loading...'}</Text>
      </View>
    );
  }

  if (error || !builder) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Builder not found'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{'Go Back'}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Header Card */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.builderName}>{safeStr(builder.builder_name) || 'Unknown'}</Text>
            <Text style={styles.companyName}>{safeStr(builder.company_name)}</Text>
          </View>
          
          {/* Header Action Icons */}
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerIconButton} onPress={handleEdit}>
              <Ionicons name="create-outline" size={22} color="#3B82F6" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconButton} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Action Buttons */}
        <View style={styles.actionButtons}>
          {builder.phone ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleCall}>
              <Ionicons name="call" size={24} color="#3B82F6" />
              <Text style={styles.actionButtonText}>{'Call'}</Text>
            </TouchableOpacity>
          ) : null}
          {builder.phone ? (
            <TouchableOpacity style={styles.actionButton} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
              <Text style={styles.actionButtonText}>{'WhatsApp'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Contact Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{'Contact Information'}</Text>
        
        <View style={styles.detailRow}>
          <Ionicons name="call" size={20} color="#6B7280" />
          <Text style={styles.detailLabel}>{'Phone'}</Text>
          <Text style={styles.detailValue}>{safeStr(builder.phone) || 'N/A'}</Text>
        </View>

        {builder.address ? (
          <View style={styles.detailRow}>
            <Ionicons name="location" size={20} color="#6B7280" />
            <Text style={styles.detailLabel}>{'Address'}</Text>
            <Text style={styles.detailValue}>{safeStr(builder.address)}</Text>
          </View>
        ) : null}
      </View>

      {/* Additional Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{'Additional Information'}</Text>
        
        <View style={styles.detailRow}>
          <Ionicons name="calendar" size={20} color="#6B7280" />
          <Text style={styles.detailLabel}>{'Added On'}</Text>
          <Text style={styles.detailValue}>{formatDate(builder.created_at)}</Text>
        </View>
      </View>

      {/* Spacing at bottom */}
      <View style={styles.bottomSpacing} />
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  builderName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 4,
  },
  companyName: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 16,
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
  bottomSpacing: {
    height: 40,
  },
});
