import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { syncService } from '../services/syncService';
import { Alert, AppState, AppStateStatus } from 'react-native';

interface SyncProgress {
  stage: string;
  progress: number;
  total: number;
}

interface OfflineContextType {
  isOnline: boolean;
  isInitialized: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  syncProgress: SyncProgress | null;
  syncError: string | null;
  triggerSync: () => Promise<void>;
  formatLastSync: () => string;
}

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  isInitialized: false,
  isSyncing: false,
  lastSyncTime: null,
  syncProgress: null,
  syncError: null,
  triggerSync: async () => {},
  formatLastSync: () => '',
});

export const useOffline = () => useContext(OfflineContext);

interface OfflineProviderProps {
  children: ReactNode;
}

export const OfflineProvider: React.FC<OfflineProviderProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Format last sync time for display
  const formatLastSync = useCallback(() => {
    if (!lastSyncTime) return 'Never synced';
    
    const now = new Date();
    const diff = now.getTime() - lastSyncTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hr ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }, [lastSyncTime]);

  // Trigger manual or automatic sync
  const triggerSync = useCallback(async () => {
    if (isSyncing) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    const online = await syncService.isOnline();
    if (!online) {
      console.log('Device is offline, cannot sync');
      setSyncError('No internet connection');
      return;
    }

    setIsSyncing(true);
    setSyncError(null);
    setSyncProgress({ stage: 'Starting sync...', progress: 0, total: 5 });

    try {
      const result = await syncService.fullSync((progress) => {
        setSyncProgress(progress);
      });

      if (result.success) {
        const syncTime = await syncService.getLastSyncTime();
        setLastSyncTime(syncTime);
        console.log('Sync completed successfully');
      } else {
        setSyncError(result.error || 'Sync failed');
        console.error('Sync failed:', result.error);
      }
    } catch (error: any) {
      setSyncError(error.message || 'Sync failed');
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [isSyncing]);

  // Initialize database and load last sync time
  useEffect(() => {
    const initializeOffline = async () => {
      try {
        console.log('Initializing offline database...');
        await syncService.initialize();
        
        const syncTime = await syncService.getLastSyncTime();
        setLastSyncTime(syncTime);
        
        setIsInitialized(true);
        console.log('Offline database initialized, last sync:', syncTime);

        // Auto-sync on startup if online
        const online = await syncService.isOnline();
        if (online) {
          console.log('Online - triggering auto-sync...');
          // Small delay to let app settle
          setTimeout(() => triggerSync(), 1000);
        }
      } catch (error) {
        console.error('Failed to initialize offline database:', error);
        setIsInitialized(true); // Still mark as initialized to not block the app
      }
    };

    initializeOffline();
  }, []);

  // Network state listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = state.isConnected === true && state.isInternetReachable === true;
      const wasOffline = !isOnline;
      setIsOnline(online);
      
      // When coming back online, auto-sync
      if (online && wasOffline && isInitialized) {
        console.log('Network restored - triggering sync...');
        triggerSync();
      }
    });

    // Initial check
    NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable === true);
    });

    return () => unsubscribe();
  }, [isOnline, isInitialized, triggerSync]);

  // App state listener - sync when app comes to foreground
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active' && isInitialized && isOnline && !isSyncing) {
        // Only sync if last sync was more than 5 minutes ago
        if (lastSyncTime) {
          const diff = Date.now() - lastSyncTime.getTime();
          if (diff > 5 * 60 * 1000) {
            console.log('App foregrounded - triggering sync...');
            triggerSync();
          }
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [isInitialized, isOnline, isSyncing, lastSyncTime, triggerSync]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isInitialized,
        isSyncing,
        lastSyncTime,
        syncProgress,
        syncError,
        triggerSync,
        formatLastSync,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};
