import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { isNetworkReachable } from '../services/networkState';
import { syncService } from '../services/syncService';
import { getAuthToken } from '../services/api';
import { AppState, AppStateStatus } from 'react-native';

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

  const syncingRef = useRef(false);

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
    if (syncingRef.current || !getAuthToken()) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    syncingRef.current = true;
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
      syncingRef.current = false;
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, []);

  // Initialize database and load last sync time
  useEffect(() => {
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const initializeOffline = async () => {
      try {
        console.log('Initializing offline database...');
        await syncService.initialize();
        
        const syncTime = await syncService.getLastSyncTime();
        setLastSyncTime(syncTime);
        
        setIsInitialized(true);
        console.log('Offline database initialized, last sync:', syncTime);

        // Only auto-sync on startup if data is stale (more than 30 minutes old)
        // or if never synced before
        const online = await syncService.isOnline();
        if (online) {
          const shouldSync = !syncTime || (Date.now() - syncTime.getTime() > 30 * 60 * 1000);
          if (shouldSync) {
            console.log('Data is stale - triggering auto-sync...');
            // Let navigation and the first screen settle before background sync.
            if (active) startupTimer = setTimeout(() => void triggerSync(), 15000);
          } else {
            console.log('Data is fresh - skipping auto-sync');
          }
        }
      } catch (error) {
        console.error('Failed to initialize offline database:', error);
        setIsInitialized(true); // Still mark as initialized to not block the app
      }
    };

    void initializeOffline();
    return () => { active = false; clearTimeout(startupTimer); };
  }, [triggerSync]);

  // Network state listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const online = isNetworkReachable(state);
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
      setIsOnline(isNetworkReachable(state));
    });

    return () => unsubscribe();
  }, [isOnline, isInitialized, triggerSync]);

  // Retry pending writes even when the connection never emits another transition.
  // Foreground retries also cover reconnects while iOS suspended the app.
  useEffect(() => {
    if (!isInitialized) return;
    const retryPending = async (refreshStale = false) => {
      if (AppState.currentState !== 'active' || !getAuthToken() || syncingRef.current) return;
      try {
        if (!await syncService.isOnline()) return;
        const pending = await syncService.hasPendingOperations();
        if (pending || (refreshStale && (!lastSyncTime || Date.now() - lastSyncTime.getTime() > 5 * 60 * 1000))) {
          await triggerSync();
        }
      } catch (error) {
        console.warn('Offline retry failed:', error);
      }
    };
    void retryPending();
    const timer = setInterval(() => void retryPending(), 30000);
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') void retryPending(true);
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [isInitialized, lastSyncTime, triggerSync]);

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
