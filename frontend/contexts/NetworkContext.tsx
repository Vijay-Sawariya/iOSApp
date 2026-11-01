import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { isNetworkReachable } from '../services/networkState';

interface NetworkContextType {
  isOnline: boolean;
  lastSync: Date | null;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  lastSync: null,
});

export const useNetwork = () => useContext(NetworkContext);

interface NetworkProviderProps {
  children: ReactNode;
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  useEffect(() => {
    // Subscribe to network state updates
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      if (AppState.currentState !== 'active' || state.isConnected === null) return;
      const online = isNetworkReachable(state);
      setIsOnline(online);
      if (online) {
        setLastSync(new Date());
      }
    });

    // Initial check
    NetInfo.fetch().then((state) => {
      if (AppState.currentState === 'active' && state.isConnected !== null) setIsOnline(isNetworkReachable(state));
    }).catch(() => {});

    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void NetInfo.refresh().catch(() => {});
    });
    return () => { unsubscribe(); subscription.remove(); };
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, lastSync }}>
      {children}
    </NetworkContext.Provider>
  );
};
