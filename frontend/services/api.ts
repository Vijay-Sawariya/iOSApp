import { cacheService } from './cacheService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from './database';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

let authToken: string | null = null;
let isOfflineMode = false;

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

const getHeaders = () => {
  console.log('getHeaders - authToken present:', !!authToken);
  return {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
};

// Helper function to fetch with offline fallback
const fetchWithCache = async <T>(
  url: string,
  cacheKey: string,
  cacheSetter: (data: T) => Promise<void>,
  cacheGetter: () => Promise<T | null>
): Promise<T> => {
  const isOnline = await cacheService.isOnline();
  
  if (!isOnline || isOfflineMode) {
    // Offline - return cached data
    const cached = await cacheGetter();
    if (cached) {
      return cached;
    }
    throw new Error('No cached data available. Please connect to the internet.');
  }
  
  try {
    // Online - fetch from API
    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) {
      // Check for auth errors
      if (response.status === 401 || response.status === 403) {
        // Try to get error message from response
        let errorMsg = 'Authentication error. Please log in again.';
        try {
          const errorData = await response.json();
          errorMsg = errorData.detail || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      
      // If API fails for other reasons, try cache
      const cached = await cacheGetter();
      if (cached) {
        return cached;
      }
      throw new Error(`API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    // Cache the response
    await cacheSetter(data);
    await cacheService.updateLastSync();
    return data;
  } catch (error) {
    // Network error - try cache
    const cached = await cacheGetter();
    if (cached) {
      return cached;
    }
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
    const response = await fetch(`${API_URL}/api/ai/urgent-followups?limit=${limit}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch urgent followups');
    return response.json();
  },

  getSmartMatches: async (limit: number = 5) => {
    const response = await fetch(`${API_URL}/api/ai/smart-matches?limit=${limit}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch smart matches');
    return response.json();
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
  getClientLeads: async () => {
    return fetchWithCache(
      `${API_URL}/api/leads/clients`,
      'leads_clients',
      (data) => cacheService.cacheClientLeads(data),
      () => cacheService.getClientLeads()
    );
  },

  // Leads - Inventory (Seller, Landlord, Builder)
  getInventoryLeads: async () => {
    return fetchWithCache(
      `${API_URL}/api/leads/inventory`,
      'leads_inventory',
      (data) => cacheService.cacheInventoryLeads(data),
      () => cacheService.getInventoryLeads()
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
    
    // Invalidate cache for this lead
    await cacheService.remove(`cache_lead_${id}`);
    
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
    return response.json();
  },

  // Reminders
  getReminders: async () => {
    return fetchWithCache(
      `${API_URL}/api/reminders`,
      'reminders',
      (data) => cacheService.cacheReminders(data),
      () => cacheService.getReminders()
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
    if (!response.ok) throw new Error('Failed to create reminder');
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
    if (!response.ok) throw new Error('Failed to update reminder');
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
    if (!response.ok) throw new Error('Failed to delete reminder');
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
    return response.json();
  },

  // Tentative Pricing APIs
  getAllPricing: async () => {
    const response = await fetch(`${API_URL}/api/pricing`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch pricing');
    return response.json();
  },

  getPricingDetail: async (pricingId: number) => {
    const response = await fetch(`${API_URL}/api/pricing/${pricingId}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch pricing details');
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
    if (!response.ok) throw new Error('Failed to create pricing');
    return response.json();
  },

  updatePricing: async (pricingId: number, data: any) => {
    const response = await fetch(`${API_URL}/api/pricing/${pricingId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update pricing');
    return response.json();
  },

  deletePricing: async (pricingId: number) => {
    const response = await fetch(`${API_URL}/api/pricing/${pricingId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete pricing');
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
