import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineApi } from '../../services/offlineApi';
import { useOffline } from '../../contexts/OfflineContext';
import { router, useFocusEffect } from 'expo-router';

interface Builder {
  id: string;
  builder_name: string;
  company_name: string;
  phone: string;
  address: string | null;
}

export default function BuildersScreen() {
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const { isOnline } = useOffline();

  const loadBuilders = async () => {
    try {
      const data = await offlineApi.getBuilders();
      setBuilders(data);
    } catch (error) {
      console.error('Failed to load builders:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadBuilders();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadBuilders();
    setRefreshing(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (!isOnline) {
      Alert.alert('Offline', 'Cannot delete builder while offline.');
      return;
    }
    Alert.alert('Delete Builder', `Are you sure you want to delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await offlineApi.deleteBuilder(id);
            loadBuilders();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete builder');
          }
        },
      },
    ]);
  };

  const renderBuilder = ({ item }: { item: Builder }) => (
    <View style={styles.builderCard}>
      <TouchableOpacity
        style={styles.builderContent}
        onPress={() => router.push(`/builders/${item.id}`)}
      >
        <View style={styles.builderIcon}>
          <Ionicons name="business" size={24} color="#3B82F6" />
        </View>
        <View style={styles.builderInfo}>
          <Text style={styles.builderName}>{item.builder_name}</Text>
          <Text style={styles.companyName}>{item.company_name}</Text>
          <View style={styles.contactInfo}>
            <Ionicons name="call" size={12} color="#6B7280" />
            <Text style={styles.phone}>{item.phone}</Text>
          </View>
          {item.address && (
            <View style={styles.contactInfo}>
              <Ionicons name="location" size={12} color="#6B7280" />
              <Text style={styles.address} numberOfLines={1}>
                {item.address}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item.id, item.builder_name)}
      >
        <Ionicons name="trash-outline" size={20} color="#EF4444" />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={builders}
        renderItem={renderBuilder}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="business-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>No builders found</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first builder</Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/builders/add')}>
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  listContent: {
    padding: 16,
  },
  builderCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
  },
  builderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  builderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  builderInfo: {
    flex: 1,
  },
  builderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  companyName: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  phone: {
    fontSize: 12,
    color: '#6B7280',
  },
  address: {
    fontSize: 12,
    color: '#6B7280',
    flex: 1,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});