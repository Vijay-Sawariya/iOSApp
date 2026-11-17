import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, Platform, Alert } from 'react-native';
import { api } from './api';

/** Registers server push so iOS can deliver new enquiries while the app is suspended. */
export function startEnquiryPush(sessionToken: string): () => void {
  let active = true, deviceToken: string | null = null, pending = false;
  const sync = async () => {
    if (!active || pending || Platform.OS === 'web' || !Device.isDevice) return;
    pending = true;
    try {
      let permission = await Notifications.getPermissionsAsync();
      if (permission.status === 'undetermined') permission = await Notifications.requestPermissionsAsync();
      if (permission.status !== 'granted') return;
      const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) throw new Error('An Expo project ID is required for enquiry push alerts.');
      const result = await Notifications.getExpoPushTokenAsync({projectId});
      if (!active) return;
      deviceToken = result.data;
      await api.registerEnquiryPush(deviceToken, sessionToken);
      if (!active) await api.registerEnquiryPush(deviceToken, sessionToken, true);
    } catch (error: any) {
      if (active) Alert.alert('Enquiry notifications unavailable', error?.message || 'Open the app again to retry notification setup.');
    } finally { pending = false; }
  };
  void sync();
  const subscription = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
  return () => {
    active = false; subscription.remove();
    if (deviceToken) void api.registerEnquiryPush(deviceToken, sessionToken, true).catch(()=>{});
  };
}
