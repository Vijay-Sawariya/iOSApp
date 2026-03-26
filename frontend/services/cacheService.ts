import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Cache keys
const CACHE_KEYS = {
  LEADS_CLIENTS: 'cache_leads_clients',
  LEADS_INVENTORY: 'cache_leads_inventory',
  BUILDERS: 'cache_builders',
  REMINDERS: 'cache_reminders',
  DASHBOARD_STATS: 'cache_dashboard_stats',
  LEAD_DETAIL_PREFIX: 'cache_lead_',
  LEAD_FOLLOWUPS_PREFIX: 'cache_followups_',
  BUILDER_DETAIL_PREFIX: 'cache_builder_',
  LAST_SYNC: 'cache_last_sync',
};

// Cache expiry time (24 hours in milliseconds)
const CACHE_EXPIRY = 24 * 60 * 60 * 1000;

interface CacheData<T> {
  data: T;
  timestamp: number;
}

class CacheService {
  // Check if device is online
  async isOnline(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected === true && state.isInternetReachable === true;
    } catch (error) {
      console.error('Error checking network status:', error);
      return false;
    }
  }

  // Save data to cache
  async set<T>(key: string, data: T): Promise<void> {
    try {
      const cacheData: CacheData<T> = {
        data,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(key, JSON.stringify(cacheData));
    } catch (error) {
      console.error('Error saving to cache:', error);
    }
  }

  // Get data from cache
  async get<T>(key: string): Promise<T | null> {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (!cached) return null;

      const cacheData: CacheData<T> = JSON.parse(cached);
      
      // Check if cache is expired
      if (Date.now() - cacheData.timestamp > CACHE_EXPIRY) {
        await AsyncStorage.removeItem(key);
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.error('Error reading from cache:', error);
      return null;
    }
  }

  // Clear specific cache
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error removing cache:', error);
    }
  }

  // Clear all cache
  async clearAll(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => key.startsWith('cache_'));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  // Get last sync time
  async getLastSync(): Promise<Date | null> {
    try {
      const timestamp = await AsyncStorage.getItem(CACHE_KEYS.LAST_SYNC);
      return timestamp ? new Date(parseInt(timestamp)) : null;
    } catch (error) {
      return null;
    }
  }

  // Update last sync time
  async updateLastSync(): Promise<void> {
    try {
      await AsyncStorage.setItem(CACHE_KEYS.LAST_SYNC, Date.now().toString());
    } catch (error) {
      console.error('Error updating last sync:', error);
    }
  }

  // Cache specific data types
  async cacheClientLeads(data: any[]): Promise<void> {
    await this.set(CACHE_KEYS.LEADS_CLIENTS, data);
  }

  async getClientLeads(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.LEADS_CLIENTS);
  }

  async cacheInventoryLeads(data: any[]): Promise<void> {
    await this.set(CACHE_KEYS.LEADS_INVENTORY, data);
  }

  async getInventoryLeads(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.LEADS_INVENTORY);
  }

  async cacheBuilders(data: any[]): Promise<void> {
    await this.set(CACHE_KEYS.BUILDERS, data);
  }

  async getBuilders(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.BUILDERS);
  }

  async cacheReminders(data: any[]): Promise<void> {
    await this.set(CACHE_KEYS.REMINDERS, data);
  }

  async getReminders(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.REMINDERS);
  }

  async cacheDashboardStats(data: any): Promise<void> {
    await this.set(CACHE_KEYS.DASHBOARD_STATS, data);
  }

  async getDashboardStats(): Promise<any | null> {
    return this.get<any>(CACHE_KEYS.DASHBOARD_STATS);
  }

  async cacheLead(id: string, data: any): Promise<void> {
    await this.set(`${CACHE_KEYS.LEAD_DETAIL_PREFIX}${id}`, data);
  }

  async getLead(id: string): Promise<any | null> {
    return this.get<any>(`${CACHE_KEYS.LEAD_DETAIL_PREFIX}${id}`);
  }

  async cacheLeadFollowups(id: string, data: any[]): Promise<void> {
    await this.set(`${CACHE_KEYS.LEAD_FOLLOWUPS_PREFIX}${id}`, data);
  }

  async getLeadFollowups(id: string): Promise<any[] | null> {
    return this.get<any[]>(`${CACHE_KEYS.LEAD_FOLLOWUPS_PREFIX}${id}`);
  }

  async cacheBuilder(id: string, data: any): Promise<void> {
    await this.set(`${CACHE_KEYS.BUILDER_DETAIL_PREFIX}${id}`, data);
  }

  async getBuilder(id: string): Promise<any | null> {
    return this.get<any>(`${CACHE_KEYS.BUILDER_DETAIL_PREFIX}${id}`);
  }
}

export const cacheService = new CacheService();
export { CACHE_KEYS };
