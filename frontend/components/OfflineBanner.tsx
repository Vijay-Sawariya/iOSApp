import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../contexts/OfflineContext';

export const OfflineBanner: React.FC = () => {
  const { isOnline, isSyncing, syncProgress, formatLastSync, triggerSync } = useOffline();
  const [showSyncComplete, setShowSyncComplete] = React.useState(false);
  const [wasJustSyncing, setWasJustSyncing] = React.useState(false);

  // Track when syncing ends to show brief "complete" message
  React.useEffect(() => {
    if (isSyncing) {
      setWasJustSyncing(true);
    } else if (wasJustSyncing) {
      // Syncing just finished - show complete briefly
      setShowSyncComplete(true);
      const timer = setTimeout(() => {
        setShowSyncComplete(false);
        setWasJustSyncing(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isSyncing, wasJustSyncing]);

  // Show brief sync complete message
  if (showSyncComplete && !isSyncing) {
    return (
      <View style={styles.syncCompleteContainer}>
        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
        <Text style={styles.syncingText}>Sync complete</Text>
      </View>
    );
  }

  // Show syncing progress banner
  if (isSyncing && syncProgress) {
    return (
      <View style={styles.syncingContainer}>
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={styles.syncingText}>{syncProgress.stage}</Text>
      </View>
    );
  }

  // Show offline banner with last sync time
  if (!isOnline) {
    return (
      <View style={styles.offlineContainer}>
        <View style={styles.offlineContent}>
          <Ionicons name="cloud-offline" size={16} color="#FFFFFF" />
          <View style={styles.offlineTextContainer}>
            <Text style={styles.offlineText}>You're offline - Viewing cached data</Text>
            <Text style={styles.lastSyncText}>Last synced: {formatLastSync()}</Text>
          </View>
        </View>
      </View>
    );
  }

  // When online and not syncing, show nothing
  return null;
};

// Separate component for a Sync Now button that can be placed anywhere
export const SyncButton: React.FC = () => {
  const { isOnline, isSyncing, triggerSync, formatLastSync } = useOffline();

  if (!isOnline) return null;

  return (
    <TouchableOpacity
      style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
      onPress={triggerSync}
      disabled={isSyncing}
    >
      {isSyncing ? (
        <ActivityIndicator size="small" color="#3B82F6" />
      ) : (
        <Ionicons name="sync" size={16} color="#3B82F6" />
      )}
      <Text style={styles.syncButtonText}>
        {isSyncing ? 'Syncing...' : `Sync Now`}
      </Text>
      {!isSyncing && (
        <Text style={styles.syncTimeText}>{formatLastSync()}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  offlineContainer: {
    backgroundColor: '#6B7280',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  offlineContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offlineTextContainer: {
    marginLeft: 10,
    flex: 1,
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  lastSyncText: {
    color: '#D1D5DB',
    fontSize: 11,
    marginTop: 2,
  },
  syncingContainer: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  syncCompleteContainer: {
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  syncingText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 10,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  syncButtonDisabled: {
    opacity: 0.7,
  },
  syncButtonText: {
    color: '#3B82F6',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  syncTimeText: {
    color: '#6B7280',
    fontSize: 11,
    marginLeft: 8,
  },
});
