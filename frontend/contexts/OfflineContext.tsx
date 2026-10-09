import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { isNetworkReachable } from '../services/networkState';
import { syncService, AUTOMATIC_SYNC_INTERVAL_MS } from '../services/syncService';
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
  isAutomaticSync: boolean;
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
  isAutomaticSync: false,
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
  const [isAutomaticSync, setIsAutomaticSync] = useState(false);
  const onlineRef = useRef(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncingRef = useRef(false);
  const nextAutomaticAttempt = useRef(0);
  const automaticFailures = useRef(0);

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
  const runSync = useCallback(async (automatic = false) => {
    if (automatic && (AppState.currentState !== 'active' || Date.now() < nextAutomaticAttempt.current)) return;
    if (syncingRef.current || !getAuthToken()) {
      console.log('Sync already in progress, skipping...');
      return;
    }

    syncingRef.current = true;
    setIsAutomaticSync(automatic);
    setIsSyncing(true);
    setSyncError(null);
    setSyncProgress({ stage: 'Starting sync...', progress: 0, total: 5 });

    try {
      const result = await syncService.fullSync((progress) => {
        setSyncProgress(progress);
      }, true, automatic);

      if (result.success) {
        automaticFailures.current = 0;
        nextAutomaticAttempt.current = Date.now() + 30000;
        setSyncError(await syncService.getPendingSyncError());
        const syncTime = await syncService.getLastSyncTime();
        setLastSyncTime(syncTime);
        console.log('Sync completed successfully');
      } else {
        automaticFailures.current += 1;
        nextAutomaticAttempt.current = Date.now() + Math.min(900000, 30000 * 2 ** Math.min(automaticFailures.current - 1, 5));
        setSyncError(result.error || 'Sync failed');
        console.error('Sync failed:', result.error);
      }
    } catch (error: any) {
      nextAutomaticAttempt.current = Date.now() + 60000;
      setSyncError(error.message || 'Sync failed');
      console.error('Sync error:', error);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, []);

  const triggerSync = useCallback(() => runSync(false), [runSync]);

  // Initialize database and load last sync time
  useEffect(() => {
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const initializeOffline = async () => {
      try {
        console.log('Initializing offline database...');
        await syncService.initialize();
        setSyncError(await syncService.getPendingSyncError());
        
        const syncTime = await syncService.getLastSyncTime();
        setLastSyncTime(syncTime);
        
        setIsInitialized(true);
        console.log('Offline database initialized, last sync:', syncTime);

        // Only auto-sync on startup if data is stale (at least 5 hours old)
        // or if never synced before
        const online = await syncService.isOnline();
        if (online) {
          const shouldSync = !syncTime || (Date.now() - syncTime.getTime() >= AUTOMATIC_SYNC_INTERVAL_MS);
          if (shouldSync) {
            console.log('Data is stale - triggering auto-sync...');
            // Let navigation and the first screen settle before background sync.
            if (active) startupTimer = setTimeout(() => void runSync(true), 15000);
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
  }, [runSync]);

  // Network state listener
  useEffect(() => {
    let offlineTimer: ReturnType<typeof setTimeout> | undefined;
    const updateNetwork = (state: NetInfoState) => {
      // Unknown reachability during resume is not a confirmed disconnection.
      if (state.isConnected === null) return;
      const online = isNetworkReachable(state);
      clearTimeout(offlineTimer);
      if (!online) {
        offlineTimer = setTimeout(() => {
          onlineRef.current = false;
          setIsOnline(false);
        }, 3000);
        return;
      }
      const wasOffline = !onlineRef.current;
      onlineRef.current = true;
      setIsOnline(true);
      if (wasOffline && isInitialized) void runSync(true);
    };
    const unsubscribe = NetInfo.addEventListener(updateNetwork);
    return () => { unsubscribe(); clearTimeout(offlineTimer); };
  }, [isInitialized, runSync]);

  // Retry pending writes even when the connection never emits another transition.
  // Foreground retries also cover reconnects while iOS suspended the app.
  useEffect(() => {
    if (!isInitialized) return;
    const retryPending = async (refreshStale = false) => {
      if (AppState.currentState !== 'active' || !getAuthToken() || syncingRef.current || Date.now() < nextAutomaticAttempt.current) return;
      try {
        const pending = await syncService.hasPendingOperations(true);
        if (pending || (refreshStale && (!lastSyncTime || Date.now() - lastSyncTime.getTime() >= AUTOMATIC_SYNC_INTERVAL_MS))) {
          await runSync(true);
        }
      } catch (error) {
        console.warn('Offline retry failed:', error);
      }
    };
    void retryPending();
    let timer: ReturnType<typeof setInterval> | undefined;
    const startTimer = () => {
      if (!timer) timer = setInterval(() => void retryPending(true), 30000);
    };
    if (AppState.currentState === 'active') startTimer();
    let wasBackgrounded = AppState.currentState === 'background';
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        startTimer();
        if (wasBackgrounded) void retryPending(true);
        wasBackgrounded = false;
      } else {
        clearInterval(timer);
        timer = undefined;
      }
      if (state === 'background') wasBackgrounded = true;
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, [isInitialized, lastSyncTime, runSync]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        isInitialized,
        isSyncing,
        isAutomaticSync,
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
