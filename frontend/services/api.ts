import { cacheService } from './cacheService';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

let authToken: string | null = null;
let isOfflineMode = false;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

export const setOfflineMode = (offline: boolean) => {
  isOfflineMode = offline;
};

export const getOfflineMode = () => isOfflineMode;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
});

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
      // If API fails, try cache
      const cached = await cacheGetter();
      if (cached) {
        return cached;
      }
      throw new Error('Failed to fetch data');
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

  createLead: async (data: any) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot create lead while offline. Please connect to the internet.');
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
};
