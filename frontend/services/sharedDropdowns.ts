import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';
import { LOCATIONS, FLOORS, BHK_OPTIONS, FACINGS, LEAD_SOURCES, AMENITIES, FILTER_FACINGS, updateLocationCount } from '../constants/leadOptions';

type Option = { value: string; label: string };
type Catalogue = { schema_version: number; options: Record<string, Option[]> };
const CACHE_KEY = `lms_shared_dropdowns_v1:${API_URL}`;
const groups = ['locations', 'floors', 'bhk', 'facings', 'lead_sources', 'amenities'];
const listeners = new Set<() => void>();
let snapshot = { ready: false, error: '' };
let pending: Promise<void> | null = null;
const publish = (ready: boolean, error = '') => {
  snapshot = { ready, error };
  listeners.forEach(listener => listener());
};
const validate = (data: Catalogue): Catalogue => {
  if (data?.schema_version !== 1 || !data.options || groups.some(group => !Array.isArray(data.options[group]) ||
    data.options[group].some(row => typeof row.value !== 'string' || !row.value || typeof row.label !== 'string'))) {
    throw new Error('Invalid shared dropdown catalogue');
  }
  return data;
};
const apply = (data: Catalogue) => {
  validate(data);
  const arrays = [LOCATIONS, FLOORS, BHK_OPTIONS, FACINGS, LEAD_SOURCES];
  groups.slice(0, 5).forEach((group, index) => {
    arrays[index].splice(0, arrays[index].length, ...data.options[group].map(row => row.value));
  });
  AMENITIES.splice(0, AMENITIES.length, ...data.options.amenities.map(row => ({ key: row.value, label: row.label })));
  FILTER_FACINGS.splice(0, FILTER_FACINGS.length, 'Any', ...FACINGS);
  updateLocationCount();
  publish(true);
};
export const refreshSharedDropdowns = (): Promise<void> => {
  if (pending) return pending;
  pending = (async () => {
    if (!snapshot.ready) {
      try { const cached = await AsyncStorage.getItem(CACHE_KEY); if (cached) apply(JSON.parse(cached)); }
      catch { /* Invalid cache is ignored; fetch the authoritative catalogue. */ }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${API_URL}/api/dropdown-options`, { signal: controller.signal });
      if (!response.ok) throw new Error('Shared dropdowns unavailable');
      const data = validate(await response.json());
      apply(data);
      try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* Current network catalogue is still usable. */ }
    } catch {
      // A failed refresh does not prove the device is offline. Cached options
      // remain usable without a persistent app-wide warning.
      publish(snapshot.ready, snapshot.ready ? '' : 'Unable to load shared dropdowns. Connect to the internet and retry.');
    } finally { clearTimeout(timer); }
  })().finally(() => { pending = null; });
  return pending;
};
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useSharedDropdowns = () => useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
