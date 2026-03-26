import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

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
      const online = state.isConnected === true && state.isInternetReachable === true;
      setIsOnline(online);
      if (online) {
        setLastSync(new Date());
      }
    });

    // Initial check
    NetInfo.fetch().then((state) => {
      setIsOnline(state.isConnected === true && state.isInternetReachable === true);
    });

    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={{ isOnline, lastSync }}>
      {children}
    </NetworkContext.Provider>
  );
};
