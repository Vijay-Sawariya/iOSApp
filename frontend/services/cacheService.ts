import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

// Cache keys
const CACHE_KEYS = {
  LEADS_CLIENTS: 'cache_leads_clients',
  LEADS_INVENTORY: 'cache_leads_inventory',
  BUILDERS: 'cache_builders',
  REMINDERS: 'cache_reminders',
  DASHBOARD_STATS: 'cache_dashboard_stats',
  URGENT_FOLLOWUPS: 'cache_urgent_followups',
  SMART_MATCHES: 'cache_smart_matches',
  USER_PERMISSIONS: 'cache_user_permissions',
  SITE_VISITS: 'cache_site_visits',
  DEALS: 'cache_deals',
  TEAM_MEMBERS: 'cache_team_members',
  ACTIVITY_LOGS: 'cache_activity_logs',
  LEAD_DETAIL_PREFIX: 'cache_lead_',
  LEAD_FOLLOWUPS_PREFIX: 'cache_followups_',
  BUILDER_DETAIL_PREFIX: 'cache_builder_',
  LAST_SYNC: 'cache_last_sync',
};

// Keep read-heavy LMS data warm for field use. Network refresh still runs in the background.
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000;

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

  async cacheUrgentFollowups(limit: number, data: any[]): Promise<void> {
    await this.set(`${CACHE_KEYS.URGENT_FOLLOWUPS}_${limit}`, data);
  }

  async getUrgentFollowups(limit: number): Promise<any[] | null> {
    return this.get<any[]>(`${CACHE_KEYS.URGENT_FOLLOWUPS}_${limit}`);
  }

  async cacheSmartMatches(limit: number, data: any[]): Promise<void> {
    await this.set(`${CACHE_KEYS.SMART_MATCHES}_${limit}`, data);
  }

  async getSmartMatches(limit: number): Promise<any[] | null> {
    return this.get<any[]>(`${CACHE_KEYS.SMART_MATCHES}_${limit}`);
  }

  async cacheUserPermissions(data: any): Promise<void> {
    await this.set(CACHE_KEYS.USER_PERMISSIONS, data);
  }

  async getUserPermissions(): Promise<any | null> {
    return this.get<any>(CACHE_KEYS.USER_PERMISSIONS);
  }

  async cacheSiteVisits(data: any[]): Promise<void> {
    await this.set(CACHE_KEYS.SITE_VISITS, data);
  }

  async getSiteVisits(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.SITE_VISITS);
  }

  async cacheDeals(data: any[]): Promise<void> {
    await this.set(CACHE_KEYS.DEALS, data);
  }

  async getDeals(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.DEALS);
  }

  async cacheTeamMembers(data: any[]): Promise<void> {
    await this.set(CACHE_KEYS.TEAM_MEMBERS, data);
  }

  async getTeamMembers(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.TEAM_MEMBERS);
  }

  async cacheActivityLogs(data: any[]): Promise<void> {
    await this.set(CACHE_KEYS.ACTIVITY_LOGS, data);
  }

  async getActivityLogs(): Promise<any[] | null> {
    return this.get<any[]>(CACHE_KEYS.ACTIVITY_LOGS);
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
