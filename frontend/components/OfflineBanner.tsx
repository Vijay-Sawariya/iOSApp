import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOffline } from '../contexts/OfflineContext';
import { colors, radii } from '../constants/theme';

export const OfflineBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const bannerInset = { paddingTop: insets.top + 6 };
  const { isOnline, isSyncing, isAutomaticSync, syncProgress, syncError, triggerSync, formatLastSync } = useOffline();
  const [showSyncComplete, setShowSyncComplete] = React.useState(false);
  const wasManualSyncing = React.useRef(false);

  React.useEffect(() => {
    if (isSyncing) {
      wasManualSyncing.current = !isAutomaticSync;
      setShowSyncComplete(false);
      return;
    }
    if (!wasManualSyncing.current) return;
    wasManualSyncing.current = false;
    if (isAutomaticSync || syncError) return;
    setShowSyncComplete(true);
    const timer = setTimeout(() => setShowSyncComplete(false), 1500);
    return () => clearTimeout(timer);
  }, [isSyncing, isAutomaticSync, syncError]);

  // Show brief sync complete message
  if (showSyncComplete && !isSyncing && !isAutomaticSync && !syncError) {
    return (
      <View style={[styles.syncCompleteContainer, bannerInset]}>
        <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" />
        <Text style={styles.syncingText}>Sync complete</Text>
      </View>
    );
  }

  // Show syncing progress banner
  if (isSyncing && !isAutomaticSync && syncProgress) {
    return (
      <View style={[styles.syncingContainer, bannerInset]}>
        <ActivityIndicator size="small" color="#FFFFFF" />
        <Text style={styles.syncingText}>{syncProgress.stage}</Text>
      </View>
    );
  }

  // Show offline banner with last sync time
  if (!isOnline) {
    return (
      <View style={[styles.offlineContainer, bannerInset]}>
        <View style={styles.offlineContent}>
          <Ionicons name="cloud-offline" size={16} color="#FFFFFF" />
          <View style={styles.offlineTextContainer}>
            <Text style={styles.offlineText}>You are offline - Viewing cached data</Text>
            <Text style={styles.lastSyncText}>Last synced: {formatLastSync()}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (syncError && !isAutomaticSync) {
    return (
      <TouchableOpacity style={[styles.offlineContainer, bannerInset]} onPress={triggerSync}
        accessibilityRole="button" accessibilityLabel={`Sync failed: ${syncError}. Tap to retry`}>
        <Text style={styles.offlineText}>Sync failed — tap to retry</Text>
        <Text style={styles.lastSyncText} numberOfLines={2}>{syncError}</Text>
      </TouchableOpacity>
    );
  }

  // When online and not syncing, show nothing
  return null;
};

// Separate component for a Sync Now button that can be placed anywhere
export const SyncButton: React.FC = () => {
  const { isOnline, isSyncing, isAutomaticSync, triggerSync, formatLastSync } = useOffline();
  const isManualSyncing = isSyncing && !isAutomaticSync;

  if (!isOnline) return null;

  return (
    <TouchableOpacity
      style={[styles.syncButton, isManualSyncing && styles.syncButtonDisabled]}
      onPress={triggerSync}
      disabled={isSyncing}
    >
      {isManualSyncing ? (
        <ActivityIndicator size="small" color="#3B82F6" />
      ) : (
        <Ionicons name="sync" size={16} color="#3B82F6" />
      )}
      <Text style={styles.syncButtonText}>
        {isManualSyncing ? 'Syncing...' : `Sync Now`}
      </Text>
      {!isManualSyncing && (
        <Text style={styles.syncTimeText}>{formatLastSync()}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  offlineContainer: {
    backgroundColor: colors.primary,
    paddingVertical: 5,
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
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 16,
  },
  syncCompleteContainer: {
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
    paddingHorizontal: 16,
  },
  syncingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
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
