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

  private async postToApi(endpoint: string, payload: any): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  }

  private async putToApi(endpoint: string, payload: any): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  }

  private async deleteFromApi(endpoint: string): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`API error: ${response.status}`);
    }
    if (response.status === 404) return { message: 'Already deleted' };
    return response.json();
  }

  private async pushPendingOperations(onProgress?: ProgressCallback): Promise<void> {
    const pending = await db.getPendingOperations();
    if (pending.length === 0) return;
    const localLeadIdMap = new Map<number, number>();
    const localReminderIdMap = new Map<number, number>();

    onProgress?.({ stage: `Uploading ${pending.length} offline change${pending.length > 1 ? 's' : ''}...`, progress: 0, total: pending.length });

    for (let index = 0; index < pending.length; index += 1) {
      const operation = pending[index];
      try {
        const payload = JSON.parse(operation.payload);
        if (operation.entity_type === 'lead' && operation.operation_type === 'create') {
          const created = await this.postToApi('/api/leads', payload);
          await db.deletePendingOperation(operation.id);
          if (operation.local_entity_id) {
            if (created?.id) {
              localLeadIdMap.set(operation.local_entity_id, created.id);
            }
            await db.removeLocalLead(operation.local_entity_id);
          }
          await db.saveLeads([created]);
          if (created?.id && payload.floor_pricing && Array.isArray(payload.floor_pricing)) {
            await db.saveFloorPricing(created.id, payload.floor_pricing.map((fp: any) => ({
              floor_label: fp.floor || fp.floor_label,
              floor_amount: parseFloat(fp.price || fp.floor_amount || 0),
            })));
          }
        } else if (operation.entity_type === 'lead' && operation.operation_type === 'update') {
          const queuedLeadId = payload.id || operation.local_entity_id;
          const leadId = queuedLeadId < 0 ? localLeadIdMap.get(queuedLeadId) : queuedLeadId;
          if (!leadId) {
            await db.deletePendingOperation(operation.id);
            onProgress?.({ stage: 'Skipped superseded offline lead update...', progress: index + 1, total: pending.length });
            continue;
          }
          const updated = await this.putToApi(`/api/leads/${leadId}`, payload.data || payload);
          await db.deletePendingOperation(operation.id);
          await db.saveLeads([updated]);
          if (updated?.id && payload.data?.floor_pricing && Array.isArray(payload.data.floor_pricing)) {
            await db.saveFloorPricing(updated.id, payload.data.floor_pricing.map((fp: any) => ({
              floor_label: fp.floor || fp.floor_label,
              floor_amount: parseFloat(fp.price || fp.floor_amount || 0),
            })));
          }
        } else if (operation.entity_type === 'lead' && operation.operation_type === 'delete') {
          const queuedLeadId = payload.id || operation.local_entity_id;
          const leadId = queuedLeadId < 0 ? localLeadIdMap.get(queuedLeadId) : queuedLeadId;
          if (!leadId) {
            await db.deletePendingOperation(operation.id);
            onProgress?.({ stage: 'Skipped superseded offline lead delete...', progress: index + 1, total: pending.length });
            continue;
          }
          await this.deleteFromApi(`/api/leads/${leadId}`);
          await db.deletePendingOperation(operation.id);
          if (leadId) {
            await db.removeLocalLead(leadId);
          }
        } else if (operation.entity_type === 'reminder' && operation.operation_type === 'create') {
          const created = await this.postToApi('/api/reminders', payload);
          if (operation.local_entity_id && created?.id) {
            localReminderIdMap.set(operation.local_entity_id, created.id);
          }
          await db.deletePendingOperation(operation.id);
        } else if (operation.entity_type === 'reminder' && operation.operation_type === 'update') {
          const queuedReminderId = payload.id || operation.local_entity_id;
          const reminderId = queuedReminderId < 0 ? localReminderIdMap.get(queuedReminderId) : queuedReminderId;
          if (!reminderId) {
            await db.deletePendingOperation(operation.id);
            onProgress?.({ stage: 'Skipped superseded offline reminder update...', progress: index + 1, total: pending.length });
            continue;
          }
          await this.putToApi(`/api/reminders/${reminderId}`, payload.data || payload);
          await db.deletePendingOperation(operation.id);
        } else if (operation.entity_type === 'reminder' && operation.operation_type === 'delete') {
          const queuedReminderId = payload.id || operation.local_entity_id;
          const reminderId = queuedReminderId < 0 ? localReminderIdMap.get(queuedReminderId) : queuedReminderId;
          if (!reminderId) {
            await db.deletePendingOperation(operation.id);
            onProgress?.({ stage: 'Skipped superseded offline reminder delete...', progress: index + 1, total: pending.length });
            continue;
          }
          await this.deleteFromApi(`/api/reminders/${reminderId}`);
          await db.deletePendingOperation(operation.id);
        }
      } catch (error: any) {
        await db.markPendingOperationError(operation.id, error.message || 'Sync failed');
        throw error;
      }

      onProgress?.({ stage: 'Uploading offline changes...', progress: index + 1, total: pending.length });
    }
  }

  // Full sync from server (quick mode skips followups)
  async fullSync(onProgress?: ProgressCallback, quickMode: boolean = true): Promise<{ success: boolean; error?: string }> {
    if (this.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    const isOnline = await this.isOnline();
    if (!isOnline) {
      return { success: false, error: 'No internet connection' };
    }

    this.isSyncing = true;

    try {
      const totalSteps = quickMode ? 4 : 5;

      await this.pushPendingOperations(onProgress);
      
      // Step 1: Fetch client leads
      onProgress?.({ stage: 'Syncing client leads...', progress: 0, total: totalSteps });
      const clientLeads = await this.fetchFromApi('/api/leads/clients');
      await db.saveLeads(clientLeads);

      // Step 2: Fetch inventory leads
      onProgress?.({ stage: 'Syncing inventory...', progress: 1, total: totalSteps });
      const inventoryLeads = await this.fetchFromApi('/api/leads/inventory');
      await db.saveLeads(inventoryLeads);

      // Save floor pricing for inventory leads
      for (const lead of inventoryLeads) {
        if (lead.floor_pricing && Array.isArray(lead.floor_pricing)) {
          await db.saveFloorPricing(lead.id, lead.floor_pricing);
        }
      }

      // Step 3: Fetch builders
      onProgress?.({ stage: 'Syncing builders...', progress: 2, total: totalSteps });
      const builders = await this.fetchFromApi('/api/builders');
      await db.saveBuilders(builders);

      // Step 4: Fetch followups ONLY in full sync mode (not quick mode)
      // Followups are fetched on-demand when viewing a specific lead
      if (!quickMode) {
        onProgress?.({ stage: 'Syncing conversations...', progress: 3, total: totalSteps });
        const allLeads = [...clientLeads, ...inventoryLeads];
        // Limit to first 50 leads to avoid long sync times
        const leadsToSync = allLeads.slice(0, 50);
        for (const lead of leadsToSync) {
          try {
            const followups = await this.fetchFromApi(`/api/leads/${lead.id}/followups`);
            await db.saveFollowups(lead.id, followups);
          } catch (error) {
            // Ignore errors for individual followups
            console.log(`Failed to fetch followups for lead ${lead.id}`);
          }
        }
      }

      // Final step: Update sync time
      onProgress?.({ stage: 'Finishing...', progress: totalSteps - 1, total: totalSteps });
      await db.updateLastSyncTime();

      onProgress?.({ stage: 'Sync complete!', progress: totalSteps, total: totalSteps });

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
