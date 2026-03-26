import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNetwork } from '../contexts/NetworkContext';

export const OfflineBanner: React.FC = () => {
  const { isOnline } = useNetwork();

  if (isOnline) return null;

  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline" size={16} color="#FFFFFF" />
      <Text style={styles.text}>You're offline - Viewing cached data</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#6B7280',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 8,
  },
});
