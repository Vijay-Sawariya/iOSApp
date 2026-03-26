import NetInfo from '@react-native-community/netinfo';
import * as db from './database';
import { getAuthToken } from './api';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface SyncProgress {
  stage: string;
  progress: number;
  total: number;
}

type ProgressCallback = (progress: SyncProgress) => void;

class SyncService {
  private isSyncing: boolean = false;

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

  // Initialize database
  async initialize(): Promise<void> {
    await db.initDatabase();
  }

  // Get auth headers
  private getHeaders() {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  // Fetch data from API
  private async fetchFromApi(endpoint: string): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  }

  // Full sync from server
  async fullSync(onProgress?: ProgressCallback): Promise<{ success: boolean; error?: string }> {
    if (this.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    const isOnline = await this.isOnline();
    if (!isOnline) {
      return { success: false, error: 'No internet connection' };
    }

    this.isSyncing = true;

    try {
      // Step 1: Fetch client leads
      onProgress?.({ stage: 'Downloading client leads...', progress: 0, total: 5 });
      const clientLeads = await this.fetchFromApi('/api/leads/clients');
      await db.saveLeads(clientLeads);

      // Step 2: Fetch inventory leads
      onProgress?.({ stage: 'Downloading inventory leads...', progress: 1, total: 5 });
      const inventoryLeads = await this.fetchFromApi('/api/leads/inventory');
      await db.saveLeads(inventoryLeads);

      // Save floor pricing for inventory leads
      for (const lead of inventoryLeads) {
        if (lead.floor_pricing && Array.isArray(lead.floor_pricing)) {
          await db.saveFloorPricing(lead.id, lead.floor_pricing);
        }
      }

      // Step 3: Fetch builders
      onProgress?.({ stage: 'Downloading builders...', progress: 2, total: 5 });
      const builders = await this.fetchFromApi('/api/builders');
      await db.saveBuilders(builders);

      // Step 4: Fetch followups for all leads
      onProgress?.({ stage: 'Downloading conversations...', progress: 3, total: 5 });
      const allLeads = [...clientLeads, ...inventoryLeads];
      for (const lead of allLeads) {
        try {
          const followups = await this.fetchFromApi(`/api/leads/${lead.id}/followups`);
          await db.saveFollowups(lead.id, followups);
        } catch (error) {
          // Ignore errors for individual followups
          console.log(`Failed to fetch followups for lead ${lead.id}`);
        }
      }

      // Step 5: Update sync time
      onProgress?.({ stage: 'Finishing sync...', progress: 4, total: 5 });
      await db.updateLastSyncTime();

      onProgress?.({ stage: 'Sync complete!', progress: 5, total: 5 });

      this.isSyncing = false;
      return { success: true };
    } catch (error: any) {
      console.error('Sync failed:', error);
      this.isSyncing = false;
      return { success: false, error: error.message || 'Sync failed' };
    }
  }

  // Get last sync time
  async getLastSyncTime(): Promise<Date | null> {
    return db.getLastSyncTime();
  }

  // Check if database has data
  async hasLocalData(): Promise<boolean> {
    const counts = await db.getLeadCount();
    return counts.clients > 0 || counts.inventory > 0;
  }

  // Get local client leads
  async getClientLeads(): Promise<any[]> {
    return db.getLocalClientLeads();
  }

  // Get local inventory leads
  async getInventoryLeads(): Promise<any[]> {
    return db.getLocalInventoryLeads();
  }

  // Get local lead by ID
  async getLead(id: number): Promise<any | null> {
    return db.getLocalLead(id);
  }

  // Get local followups
  async getFollowups(leadId: number): Promise<any[]> {
    return db.getLocalFollowups(leadId);
  }

  // Get local builders
  async getBuilders(): Promise<any[]> {
    return db.getLocalBuilders();
  }

  // Get local builder by ID
  async getBuilder(id: number): Promise<any | null> {
    return db.getLocalBuilder(id);
  }

  // Get dashboard stats from local database
  async getDashboardStats(): Promise<any> {
    const leadCounts = await db.getLeadCount();
    const builderCount = await db.getBuilderCount();
    return {
      total_leads: leadCounts.clients + leadCounts.inventory,
      client_leads: leadCounts.clients,
      inventory_leads: leadCounts.inventory,
      total_builders: builderCount,
    };
  }
}

export const syncService = new SyncService();
