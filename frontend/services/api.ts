import { CACHE_KEYS, cacheService } from './cacheService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from './database';
import { API_URL } from '../constants/config';

let authToken: string | null = null;
let isOfflineMode = false;
let authFailureHandler: (() => void | Promise<void>) | null = null;

type CacheFetchOptions = {
  forceNetwork?: boolean;
  onBackgroundRefresh?: (data: any) => void;
  skipCacheWrite?: boolean;
};

const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 45000
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const isRequestTimeout = (error: unknown): boolean =>
  error instanceof Error && error.name === 'AbortError';

export const setAuthToken = (token: string | null) => {
  console.log('setAuthToken called with:', token ? 'token present' : 'null');
  authToken = token;
};

export const getAuthToken = () => authToken;

export const setAuthFailureHandler = (
  handler: (() => void | Promise<void>) | null
) => {
  authFailureHandler = handler;
};

const notifyAuthFailure = (response: Response) => {
  if (response.status === 401 && authFailureHandler) {
    void authFailureHandler();
  }
};

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
  notifyAuthFailure(response);
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
    let response: Response;
    try {
      const separator = url.includes('?') ? '&' : '?';
      const freshUrl = `${url}${separator}_refresh=${Date.now()}`;
      response = await fetchWithTimeout(freshUrl, {
        headers: {
          ...getHeaders(),
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        cache: 'no-store',
      });
    } catch (error) {
      if (isRequestTimeout(error)) {
        throw new Error('The server took too long to respond. Please try again.');
      }
      throw error;
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        notifyAuthFailure(response);
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
    // Update mounted screens before serializing a potentially large dataset to
    // AsyncStorage. Disk persistence must not delay visible fresh records.
    options.onBackgroundRefresh?.(data);
    if (!options.skipCacheWrite) await cacheSetter(data);
    await cacheService.updateLastSync();
    return data;
  };

  if (options.forceNetwork) {
    const isOnline = await cacheService.isOnline();
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
        return refreshFromNetwork()
          .catch((error) => {
            if (!isRequestTimeout(error)) {
              console.log(`Background refresh failed for ${cacheKey}:`, error);
            }
          });
      });
    }
    return cached;
  }

  const isOnline = await cacheService.isOnline();
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
  getFeatureFlags: async (): Promise<{ is_admin: boolean; flags: Record<string, boolean> }> => {
    const response = await fetchWithTimeout(`${API_URL}/api/user/feature-flags`, {
      headers: getHeaders(),
    }, 5000);
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to load feature access'));
    }
    return response.json();
  },

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

  getMobileWorkbench: async (options?: CacheFetchOptions) => {
    return fetchWithCache(
      `${API_URL}/api/mobile/workbench`,
      'mobile_workbench',
      (data) => cacheService.set('cache_mobile_workbench', data),
      () => cacheService.get('cache_mobile_workbench'),
      options
    );
  },

  getAssignedLeads: async (options?: CacheFetchOptions) => {
    return fetchWithCache(
      `${API_URL}/api/mobile/assigned-leads`,
      'mobile_assigned_leads',
      (data) => cacheService.set('cache_mobile_assigned_leads', data),
      () => cacheService.get('cache_mobile_assigned_leads'),
      options
    );
  },

  getCollaborationInbox: async () => {
    const response = await fetch(`${API_URL}/api/collaboration/inbox`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to load team inbox'));
    }
    return response.json();
  },

  markCollaborationInboxRead: async () => {
    const response = await fetch(`${API_URL}/api/collaboration/inbox/read`, {
      method: 'PUT',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to mark team inbox read'));
    }
    return response.json();
  },

  getLeadCollaboration: async (leadId: string | number) => {
    const response = await fetch(`${API_URL}/api/leads/${leadId}/collaboration`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to load lead collaboration'));
    }
    return response.json();
  },

  addLeadComment: async (leadId: string | number, body: string, mentionIds: number[] = []) => {
    const response = await fetch(`${API_URL}/api/leads/${leadId}/collaboration/comments`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ body, mention_ids: mentionIds }),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to add comment'));
    }
    return response.json();
  },

  requestLeadHandoff: async (leadId: string | number, toUserId: number, note: string) => {
    const response = await fetch(`${API_URL}/api/leads/${leadId}/collaboration/handoffs`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ to_user_id: toUserId, note }),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to request handoff'));
    }
    return response.json();
  },

  respondToLeadHandoff: async (handoffId: number, decision: 'accepted' | 'declined') => {
    const response = await fetch(`${API_URL}/api/collaboration/handoffs/${handoffId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ decision }),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to respond to handoff'));
    }
    return response.json();
  },

  getMobilePerformance: async (days = 30, agentId?: number) => {
    const params = new URLSearchParams({ days: String(days) });
    if (agentId) params.set('agent_id', String(agentId));
    const response = await fetch(`${API_URL}/api/mobile/performance?${params.toString()}`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to load performance'));
    }
    return response.json();
  },

  getEnquiries: async (options?: CacheFetchOptions) => {
    return fetchWithCache(
      `${API_URL}/api/mobile/enquiries`,
      'mobile_enquiries',
      (data) => cacheService.set('cache_mobile_enquiries', data),
      () => cacheService.get('cache_mobile_enquiries'),
      options
    );
  },

  getLegacyInventory: async (
    category: 'all' | 'kothi' | 'floor' = 'all',
    criteria: {
      name?: string;
      location?: string;
      address?: string;
      phone?: string;
      status?: string;
      messageStatus?: 'all' | 'not_sent' | 'sent';
    } = {},
    options?: CacheFetchOptions
  ) => {
    const params = new URLSearchParams();
    if (category !== 'all') params.append('category', category);
    Object.entries(criteria).forEach(([key, value]) => {
      if (value?.trim() && !(key === 'messageStatus' && value === 'all')) {
        params.append(key === 'messageStatus' ? 'message_status' : key, value.trim());
      }
    });
    const query = params.toString() ? `?${params.toString()}` : '';
    const criteriaKey = ['name', 'location', 'address', 'phone', 'status', 'messageStatus']
      .map((key) => criteria[key as keyof typeof criteria]?.trim().toLowerCase() || '')
      .join('_');
    const cacheKey = `cache_legacy_inventory_${category}_${criteriaKey || 'all'}`;
    return fetchWithCache(
      `${API_URL}/api/mobile/enquiries${query}`,
      `legacy_inventory_${category}_${criteriaKey || 'all'}`,
      (data) => cacheService.set(cacheKey, data),
      () => cacheService.get(cacheKey),
      options
    );
  },

  updateLegacyInventoryStatus: async (source: string, legacyId: number, status: string) => {
    const response = await fetchWithTimeout(
      `${API_URL}/api/mobile/legacy-inventory/${encodeURIComponent(source)}/${legacyId}/status`,
      {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ status }),
      }
    );
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to update legacy status'));
    }
    await cacheService.clearLegacyInventory();
    return response.json();
  },

  deleteLegacyInventory: async (source: string, legacyId: number) => {
    const response = await fetchWithTimeout(
      `${API_URL}/api/mobile/legacy-inventory/${encodeURIComponent(source)}/${legacyId}`,
      { method: 'DELETE', headers: getHeaders() }
    );
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to delete legacy inventory'));
    }
    await cacheService.clearLegacyInventory();
    return response.json();
  },

  convertEnquiry: async (enquiryId: number) => {
    const response = await fetch(`${API_URL}/api/mobile/enquiries/${enquiryId}/convert`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to convert enquiry'));
    }
    await Promise.all([
      cacheService.remove('cache_mobile_enquiries'),
      cacheService.remove(CACHE_KEYS.LEADS_CLIENTS),
      cacheService.remove(CACHE_KEYS.DASHBOARD_STATS),
    ]);
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
      const queued = await db.queuePendingLeadUpdate(parseInt(id, 10), data);
      await cacheService.remove(`cache_lead_${id}`);
      await cacheService.remove(CACHE_KEYS.LEADS_CLIENTS);
      await cacheService.remove(CACHE_KEYS.LEADS_INVENTORY);
      await cacheService.remove(CACHE_KEYS.DASHBOARD_STATS);
      return queued;
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
      const queued = await db.queuePendingLeadDelete(parseInt(id, 10));
      await cacheService.remove(`cache_lead_${id}`);
      await cacheService.remove(CACHE_KEYS.LEADS_CLIENTS);
      await cacheService.remove(CACHE_KEYS.LEADS_INVENTORY);
      await cacheService.remove(CACHE_KEYS.DASHBOARD_STATS);
      return queued;
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
      const queued = await db.queuePendingReminderCreate(data);
      await invalidateReminderCaches();
      return queued;
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
      const queued = await db.queuePendingReminderUpdate(parseInt(id, 10), data);
      await invalidateReminderCaches();
      return queued;
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
      const queued = await db.queuePendingReminderDelete(parseInt(id, 10));
      await invalidateReminderCaches();
      return queued;
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

  getAssignableUsers: async () => {
    const headers = getHeaders();
    const listEndpoints = [
      `${API_URL}/api/users/assignable`,
      `${API_URL}/api/team/members-with-permissions`,
      `${API_URL}/api/team/members`,
    ];

    let lastError = 'Failed to fetch users';
    for (const endpoint of listEndpoints) {
      try {
        const response = await fetch(endpoint, { headers });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) return data;
        } else {
          lastError = await getApiErrorMessage(response, 'Failed to fetch users');
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Failed to fetch users';
      }
    }

    const meResponse = await fetch(`${API_URL}/api/auth/me`, { headers });
    if (meResponse.ok) {
      const currentUser = await meResponse.json();
      return currentUser ? [{ ...currentUser, is_current_user: true }] : [];
    }

    throw new Error(await getApiErrorMessage(meResponse, lastError));
  },

  // WhatsApp
  sendWhatsApp: async (data: { phone: string; message: string; lead_id?: string; status?: string; source?: string }) => {
    const isOnline = await cacheService.isOnline();
    if (!isOnline) {
      throw new Error('Cannot send WhatsApp while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to log WhatsApp'));
    }
    await Promise.all([
      cacheService.remove(CACHE_KEYS.LEADS_CLIENTS),
      cacheService.remove(CACHE_KEYS.LEADS_INVENTORY),
      data.lead_id ? cacheService.remove(`cache_lead_${data.lead_id}`) : Promise.resolve(),
    ]);
    return response.json();
  },

  getWhatsAppLogs: async (leadId?: string | number) => {
    const query = leadId ? `?lead_id=${encodeURIComponent(String(leadId))}` : '';
    const response = await fetch(`${API_URL}/api/whatsapp/logs${query}`, {
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

  getLeadActivity: async (leadId: string | number) => {
    const response = await fetch(`${API_URL}/api/leads/${leadId}/activity`, {
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to fetch lead timeline'));
    }
    return response.json();
  },

  // Tentative Pricing APIs
  getAllPricing: async () => {
    return fetchWithCache(
      `${API_URL}/api/pricing`,
      'plot_floor_pricing',
      (data) => cacheService.cachePlotFloorPricing(data),
      () => cacheService.getPlotFloorPricing()
    );
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
    const result = await response.json();
    await cacheService.remove(CACHE_KEYS.PLOT_FLOOR_PRICING);
    return result;
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
    const result = await response.json();
    await cacheService.remove(CACHE_KEYS.PLOT_FLOOR_PRICING);
    return result;
  },

  deletePricing: async (pricingId: number) => {
    const response = await fetch(`${API_URL}/api/pricing/${pricingId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, 'Failed to delete pricing'));
    }
    const result = await response.json();
    await cacheService.remove(CACHE_KEYS.PLOT_FLOOR_PRICING);
    return result;
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
