import { CACHE_KEYS, cacheService } from './cacheService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from './database';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();

let authToken: string | null = null;
let isOfflineMode = false;

type CacheFetchOptions = {
  forceNetwork?: boolean;
};

export const setAuthToken = (token: string | null) => {
  console.log('setAuthToken called with:', token ? 'token present' : 'null');
  authToken = token;
};

export const getAuthToken = () => authToken;

// Initialize token from storage on app start
export const initializeAuthToken = async () => {
  try {
    const storedToken = await AsyncStorage.getItem('token');
    if (storedToken) {
      authToken = storedToken;
      console.log('Auth token initialized from storage');
    }
  } catch (error) {
    console.error('Failed to initialize auth token:', error);
  }
};

export const setOfflineMode = (offline: boolean) => {
  isOfflineMode = offline;
};

export const getOfflineMode = () => isOfflineMode;


const getUserScopedCacheKey = (baseKey: string): string => {
  if (!authToken) return `${baseKey}_anon`;
  const tokenSuffix = authToken.slice(-16);
  return `${baseKey}_${tokenSuffix}`;
};

const invalidateReminderCaches = async () => {
  await Promise.all([
    cacheService.remove(CACHE_KEYS.REMINDERS),
    cacheService.remove(getUserScopedCacheKey(CACHE_KEYS.REMINDERS)),
    cacheService.remove(`${CACHE_KEYS.URGENT_FOLLOWUPS}_5`),
    cacheService.remove(`${CACHE_KEYS.URGENT_FOLLOWUPS}_10`),
  ]);
};

const getHeaders = () => {
  console.log('getHeaders - authToken present:', !!authToken);
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
};

const getApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.detail)) {
      return data.detail
        .map((item: any) => item?.msg || item?.message || JSON.stringify(item))
        .filter(Boolean)
        .join(', ');
    }
    if (typeof data?.message === 'string') return data.message;
    if (typeof data?.error === 'string') return data.error;
  } catch {}

  return `${fallback} (status ${response.status})`;
};

// Helper function to fetch with stale-while-revalidate cache behavior
const fetchWithCache = async <T>(
  url: string,
  cacheKey: string,
  cacheSetter: (data: T) => Promise<void>,
  cacheGetter: () => Promise<T | null>,
  options: CacheFetchOptions = {}
): Promise<T> => {
  const refreshFromNetwork = async (): Promise<T> => {
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        let errorMsg = 'Authentication error. Please log in again.';
        try {
          const errorData = await response.json();
          errorMsg = errorData.detail || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    await cacheSetter(data);
    await cacheService.updateLastSync();
    return data;
  };

  const isOnline = await cacheService.isOnline();

  if (options.forceNetwork) {
    if (!isOnline || isOfflineMode) {
      throw new Error('Live refresh requires an internet connection.');
    }

    return refreshFromNetwork();
  }

  const cached = await cacheGetter();
  if (cached) {
    if (!isOfflineMode) {
      void cacheService.isOnline().then((isOnline) => {
        if (!isOnline) return;
        return refreshFromNetwork().catch((error) => {
          console.log(`Background refresh failed for ${cacheKey}:`, error);
        });
      });
    }
    return cached;
  }

  if (!isOnline || isOfflineMode) {
    throw new Error('No cached data available. Please connect to the internet.');
  }

  try {
    return await refreshFromNetwork();
  } catch (error) {
    throw error;
  }
};

export const api = {
  // Check if online
  isOnline: () => cacheService.isOnline(),
  
  // Get last sync time
  getLastSync: () => cacheService.getLastSync(),
  
  // Clear all cache
  clearCache: () => cacheService.clearAll(),

  // Warm the high-traffic screens after login without blocking navigation.
  preloadCoreData: async () => {
    await Promise.allSettled([
      api.getDashboardStats(),
      api.getClientLeads(),
      api.getInventoryLeads(),
      api.getBuilders(),
      api.getReminders(),
      api.getUrgentFollowups(5),
      api.getSmartMatches(3),
    ]);
  },

  // Dashboard
  getDashboardStats: async () => {
    return fetchWithCache(
      `${API_URL}/api/dashboard/stats`,
      'dashboard_stats',
      (data) => cacheService.cacheDashboardStats(data),
      () => cacheService.getDashboardStats()
    );
  },

  // AI Features
  getUrgentFollowups: async (limit: number = 10) => {
    return fetchWithCache(
      `${API_URL}/api/ai/urgent-followups?limit=${limit}`,
      `urgent_followups_${limit}`,
      (data) => cacheService.cacheUrgentFollowups(limit, data),
      () => cacheService.getUrgentFollowups(limit)
    );
  },

  getSmartMatches: async (limit: number = 5) => {
    return fetchWithCache(
      `${API_URL}/api/ai/smart-matches?limit=${limit}`,
      `smart_matches_${limit}`,
      (data) => cacheService.cacheSmartMatches(limit, data),
      () => cacheService.getSmartMatches(limit)
    );
  },

  generateAIMessage: async (leadId: number, messageType: string, customContext?: string) => {
    const response = await fetch(`${API_URL}/api/ai/generate-message`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        lead_id: leadId,
        message_type: messageType,
        custom_context: customContext
      }),
    });
    if (!response.ok) throw new Error('Failed to generate AI message');
    return response.json();
  },

  // Leads - All
  getLeads: async () => {
    const response = await fetch(`${API_URL}/api/leads`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch leads');
    return response.json();
  },

  // Leads - Clients (Buyer, Tenant)
  getClientLeads: async (options?: CacheFetchOptions) => {
    return fetchWithCache(
      `${API_URL}/api/leads/clients`,
      'leads_clients',
      (data) => cacheService.cacheClientLeads(data),
      () => cacheService.getClientLeads(),
      options
    );
  },

  // Leads - Inventory (Seller, Landlord, Builder)
  getInventoryLeads: async (options?: CacheFetchOptions) => {
    return fetchWithCache(
      `${API_URL}/api/leads/inventory`,
      'leads_inventory',
      (data) => cacheService.cacheInventoryLeads(data),
      () => cacheService.getInventoryLeads(),
      options
    );
  },

  getLead: async (id: string) => {
    return fetchWithCache(
      `${API_URL}/api/leads/${id}`,
      `lead_${id}`,
      (data) => cacheService.cacheLead(id, data),
      () => cacheService.getLead(id)
    );
  },

  getPreferredInventoryIds: async (clientId: number): Promise<number[]> => {
    const response = await fetch(`${API_URL}/api/leads/${clientId}/preferred-inventory`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to get preferred inventory');
    const data = await response.json();
    return data.preferred_inventory_ids || [];
  },

  getMatchingInventory: async (leadId: number, filters: any = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        if (value.length > 0) params.set(key, value.join(','));
      } else {
        params.set(key, String(value));
      }
    });
    const query = params.toString();
    const response = await fetch(`${API_URL}/api/leads/${leadId}/matching-inventory${query ? `?${query}` : ''}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch matching inventory');
    return response.json();
  },

  getMatchingClients: async (leadId: number, filters: any = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      if (Array.isArray(value)) {
        if (value.length > 0) params.set(key, value.join(','));
      } else {
        params.set(key, String(value));
      }
    });
    const query = params.toString();
    const response = await fetch(`${API_URL}/api/leads/${leadId}/matching-clients${query ? `?${query}` : ''}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch matching clients');
    return response.json();
  },

  addPreferredLeads: async (leadId: number, matchingLeadIds: number[]) => {
    const response = await fetch(`${API_URL}/api/leads/${leadId}/preferred-leads`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ matching_lead_ids: matchingLeadIds }),
    });
    if (!response.ok) throw new Error('Failed to save preferred leads');
    return response.json();
  },

  createLead: async (data: any) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      return db.queuePendingLeadCreate(data);
    }
    
    const response = await fetch(`${API_URL}/api/leads`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create lead');
    await cacheService.remove(CACHE_KEYS.LEADS_CLIENTS);
    await cacheService.remove(CACHE_KEYS.LEADS_INVENTORY);
    await cacheService.remove(CACHE_KEYS.DASHBOARD_STATS);
    return response.json();
  },

  updateLead: async (id: string, data: any) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot update lead while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/leads/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update lead');
    
    await cacheService.remove(`cache_lead_${id}`);
    await cacheService.remove(CACHE_KEYS.LEADS_CLIENTS);
    await cacheService.remove(CACHE_KEYS.LEADS_INVENTORY);
    await cacheService.remove(CACHE_KEYS.DASHBOARD_STATS);
    
    return response.json();
  },

  deleteLead: async (id: string) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot delete lead while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/leads/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete lead');
    await cacheService.remove(`cache_lead_${id}`);
    await cacheService.remove(CACHE_KEYS.LEADS_CLIENTS);
    await cacheService.remove(CACHE_KEYS.LEADS_INVENTORY);
    await cacheService.remove(CACHE_KEYS.DASHBOARD_STATS);
    return response.json();
  },

  // Builders
  getBuilders: async () => {
    return fetchWithCache(
      `${API_URL}/api/builders`,
      'builders',
      (data) => cacheService.cacheBuilders(data),
      () => cacheService.getBuilders()
    );
  },

  getBuilder: async (id: string) => {
    return fetchWithCache(
      `${API_URL}/api/builders/${id}`,
      `builder_${id}`,
      (data) => cacheService.cacheBuilder(id, data),
      () => cacheService.getBuilder(id)
    );
  },

  getBuilderLeads: async (id: string) => {
    const response = await fetch(`${API_URL}/api/builders/${id}/leads`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch builder leads');
    return response.json();
  },

  createBuilder: async (data: any) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot create builder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/builders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create builder');
    await cacheService.remove(CACHE_KEYS.BUILDERS);
    return response.json();
  },

  updateBuilder: async (id: string, data: any) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot update builder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/builders/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update builder');
    await cacheService.remove(CACHE_KEYS.BUILDERS);
    await cacheService.remove(`cache_builder_${id}`);
    return response.json();
  },

  deleteBuilder: async (id: string) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot delete builder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/builders/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete builder');
    await cacheService.remove(CACHE_KEYS.BUILDERS);
    await cacheService.remove(`cache_builder_${id}`);
    return response.json();
  },

  // Reminders
  getReminders: async () => {
    const cacheKey = getUserScopedCacheKey(CACHE_KEYS.REMINDERS);
    return fetchWithCache(
      `${API_URL}/api/reminders`,
      'reminders',
      (data) => cacheService.set(cacheKey, data),
      () => cacheService.get(cacheKey)
    );
  },

  createReminder: async (data: any) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot create reminder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/reminders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to create reminder'));
    }
    await invalidateReminderCaches();
    return response.json();
  },

  updateReminder: async (id: string, data: any) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot update reminder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/reminders/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to update reminder'));
    }
    await invalidateReminderCaches();
    return response.json();
  },

  deleteReminder: async (id: string) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot delete reminder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/reminders/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(await getApiErrorMessage(response, 'Failed to delete reminder'));
    }
    await invalidateReminderCaches();
    if (response.status === 404) return { message: 'Reminder already deleted' };
    return response.json();
  },

  // WhatsApp
  sendWhatsApp: async (data: { phone: string; message: string; lead_id?: string }) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot send WhatsApp while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to send WhatsApp');
    return response.json();
  },

  getWhatsAppLogs: async () => {
    const response = await fetch(`${API_URL}/api/whatsapp/logs`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch WhatsApp logs');
    return response.json();
  },

  // Followups/Conversations
  getLeadFollowups: async (leadId: string) => {
    return fetchWithCache(
      `${API_URL}/api/leads/${leadId}/followups`,
      `followups_${leadId}`,
      (data) => cacheService.cacheLeadFollowups(leadId, data),
      () => cacheService.getLeadFollowups(leadId)
    );
  },

  createFollowup: async (leadId: string, data: {
    channel: string;
    outcome: string;
    notes?: string;
    followup_date?: string;
    next_followup?: string;
  }) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot create followup while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/leads/${leadId}/followups`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ ...data, lead_id: parseInt(leadId) }),
    });
    if (!response.ok) throw new Error('Failed to create followup');
    await cacheService.remove(`cache_followups_${leadId}`);
    await cacheService.remove(`${CACHE_KEYS.URGENT_FOLLOWUPS}_5`);
    await cacheService.remove(`${CACHE_KEYS.URGENT_FOLLOWUPS}_10`);
    return response.json();
  },

  // Tentative Pricing APIs
  getAllPricing: async () => {
    const response = await fetch(`${API_URL}/api/pricing`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to fetch pricing'));
    }
    return response.json();
  },

  getPricingDetail: async (pricingId: number) => {
    const response = await fetch(`${API_URL}/api/pricing/${pricingId}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to fetch pricing details'));
    }
    return response.json();
  },

  createPricing: async (data: {
    location_id: number;
    circle: string;
    plot_size: number;
    price_per_sq_yard: string;
    min_price: number;
    max_price: number;
    tentative_price?: number;
    floors: { floor_label: string; tentative_floor_price: string }[];
  }) => {
    const response = await fetch(`${API_URL}/api/pricing`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to create pricing'));
    }
    return response.json();
  },

  updatePricing: async (pricingId: number, data: any) => {
    const response = await fetch(`${API_URL}/api/pricing/${pricingId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to update pricing'));
    }
    return response.json();
  },

  deletePricing: async (pricingId: number) => {
    const response = await fetch(`${API_URL}/api/pricing/${pricingId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to delete pricing'));
    }
    return response.json();
  },

  getAllLocations: async () => {
    const response = await fetch(`${API_URL}/api/locations/all`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch locations');
    return response.json();
  },

  // ============= Inventory File Upload APIs =============
  uploadInventoryFile: async (leadId: number, file: {
    uri: string;
    name: string;
    type: string;
  }) => {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);

    const response = await fetch(`${API_URL}/api/inventory/${leadId}/files`, {
      method: 'POST',
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to upload file');
    }
    return response.json();
  },

  getInventoryFiles: async (leadId: number) => {
    const response = await fetch(`${API_URL}/api/inventory/${leadId}/files`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch files');
    return response.json();
  },

  getInventoryFile: async (fileId: number) => {
    const response = await fetch(`${API_URL}/api/inventory/files/${fileId}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch file');
    return response.json();
  },

  deleteInventoryFile: async (fileId: number) => {
    const response = await fetch(`${API_URL}/api/inventory/files/${fileId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete file');
    return response.json();
  },

  getInventoryFilesCount: async (leadId: number) => {
    const response = await fetch(`${API_URL}/api/inventory/${leadId}/files/count`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch file count');
    return response.json();
  },

  // Map Data
  getMapData: async (leadType?: string) => {
    const url = new URL(`${API_URL}/api/leads/map-data`);
    if (leadType) url.searchParams.append('lead_type', leadType);
    
    const response = await fetch(url.toString(), {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch map data');
    return response.json();
  },
};
