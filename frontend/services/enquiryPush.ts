import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { AppState, Platform } from 'react-native';
import { api } from './api';

/** Registers server push so iOS can deliver new enquiries while the app is suspended. */
export function startEnquiryPush(sessionToken: string): () => void {
  let active = true, deviceToken: string | null = null, pending = false;
  let nextSync = 0, retryDelay = 30_000;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  const clearRetry = () => {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
  };
  const sync = async () => {
    if (!active || pending || Platform.OS === 'web' || !Device.isDevice ||
        AppState.currentState !== 'active' || Date.now() < nextSync) return;
    clearRetry();
    pending = true;
    try {
      let permission = await Notifications.getPermissionsAsync();
      if (!active) return;
      if (permission.status === 'undetermined') permission = await Notifications.requestPermissionsAsync();
      if (!active || permission.status !== 'granted') return;
      const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) throw new Error('An Expo project ID is required for enquiry push alerts.');
      const result = await Notifications.getExpoPushTokenAsync({projectId});
      if (!active) return;
      deviceToken = result.data;
      await api.registerEnquiryPush(deviceToken, sessionToken);
      if (!active) await api.registerEnquiryPush(deviceToken, sessionToken, true);
      // Avoid contacting Expo on every foreground transition, including permission prompts.
      nextSync = Date.now() + 60 * 60_000;
      retryDelay = 30_000;
    } catch (error) {
      if (active) {
        console.warn('Enquiry push registration failed; will retry:', error);
        nextSync = Date.now() + retryDelay;
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          void sync();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 5 * 60_000);
      }
    } finally { pending = false; }
  };
  void sync();
  const subscription = AppState.addEventListener('change', state => { if (state === 'active') void sync(); });
  return () => {
    active = false;
    clearRetry();
    subscription.remove();
    if (deviceToken) void api.registerEnquiryPush(deviceToken, sessionToken, true).catch(()=>{});
  };
}
