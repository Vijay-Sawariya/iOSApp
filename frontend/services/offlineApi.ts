/**
 * Offline-first API service
 * Uses SQLite for offline data access, falls back to network when online
 * 
 * RULES:
 * - READ operations: Try SQLite first when offline, network when online
 * - WRITE operations: Always require network (as per user requirement)
 * - Images/PDFs: Always load from server (not cached locally)
 */

import NetInfo from '@react-native-community/netinfo';
import { syncService } from './syncService';
import { api, getAuthToken } from './api';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

type LeadFetchOptions = {
  forceNetwork?: boolean;
};

class OfflineApiService {
  private async isOnline(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected === true && state.isInternetReachable === true;
    } catch {
      return false;
    }
  }

  private getHeaders() {
    const token = getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private async fetchFromNetwork(endpoint: string): Promise<any> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  }

  // ============ CLIENT LEADS ============
  async getClientLeads(options?: LeadFetchOptions): Promise<any[]> {
    try {
      return await api.getClientLeads(options);
    } catch (error) {
      console.log('Cached API fetch failed, falling back to SQLite');
      return syncService.getClientLeads();
    }
  }

  // ============ INVENTORY LEADS ============
  async getInventoryLeads(options?: LeadFetchOptions): Promise<any[]> {
    try {
      return await api.getInventoryLeads(options);
    } catch (error) {
      console.log('Cached API fetch failed, falling back to SQLite');
      return syncService.getInventoryLeads();
    }
  }

  // ============ SINGLE LEAD ============
  async getLead(id: string | number): Promise<any | null> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    
    try {
      return await api.getLead(String(id));
    } catch (error) {
      console.log('Cached API fetch failed, falling back to SQLite');
      return syncService.getLead(numericId);
    }
  }

  async getMatchingInventory(leadId: number, filters: any = {}): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Matching search requires internet.');
    }
    return api.getMatchingInventory(leadId, filters);
  }

  async getMatchingClients(leadId: number, filters: any = {}): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Matching search requires internet.');
    }
    return api.getMatchingClients(leadId, filters);
  }

  async addPreferredLeads(leadId: number, matchingLeadIds: number[]): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Saving matching leads requires internet.');
    }
    return api.addPreferredLeads(leadId, matchingLeadIds);
  }

  // ============ BUILDERS ============
  async getBuilders(): Promise<any[]> {
    try {
      return await api.getBuilders();
    } catch (error) {
      console.log('Cached API fetch failed, falling back to SQLite');
      return syncService.getBuilders();
    }
  }

  // ============ SINGLE BUILDER ============
  async getBuilder(id: string | number): Promise<any | null> {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    
    try {
      return await api.getBuilder(String(id));
    } catch (error) {
      console.log('Cached API fetch failed, falling back to SQLite');
      return syncService.getBuilder(numericId);
    }
  }

  // ============ FOLLOWUPS/CONVERSATIONS ============
  async getLeadFollowups(leadId: string | number): Promise<any[]> {
    const numericId = typeof leadId === 'string' ? parseInt(leadId, 10) : leadId;
    
    try {
      return await api.getLeadFollowups(String(leadId));
    } catch (error) {
      console.log('Cached API fetch failed, falling back to SQLite');
      return syncService.getFollowups(numericId);
    }
  }

  // ============ DASHBOARD STATS ============
  async getDashboardStats(): Promise<any> {
    try {
      return await api.getDashboardStats();
    } catch (error) {
      console.log('Cached API fetch failed, falling back to SQLite');
      return syncService.getDashboardStats();
    }
  }

  // ============ WRITE OPERATIONS (Always require network) ============
  
  async createLead(data: any): Promise<any> {
    return api.createLead(data);
  }

  async updateLead(id: string, data: any): Promise<any> {
    return api.updateLead(id, data);
  }

  async deleteLead(id: string): Promise<any> {
    return api.deleteLead(id);
  }

  async createBuilder(data: any): Promise<any> {
    return api.createBuilder(data);
  }

  async updateBuilder(id: string, data: any): Promise<any> {
    return api.updateBuilder(id, data);
  }

  async deleteBuilder(id: string): Promise<any> {
    return api.deleteBuilder(id);
  }

  async createFollowup(leadId: string, data: any): Promise<any> {
    return api.createFollowup(leadId, data);
  }

  // ============ REMINDERS ============
  async getReminders(): Promise<any[]> {
    try {
      const reminders = await api.getReminders();
      return Array.isArray(reminders) ? reminders : [];
    } catch (error) {
      console.log('Cached API fetch failed, reminders cache unavailable');
      return [];
    }
  }

  async createReminder(data: any): Promise<any> {
    return api.createReminder(data);
  }

  async updateReminder(id: string, data: any): Promise<any> {
    return api.updateReminder(id, data);
  }

  async deleteReminder(id: string): Promise<any> {
    return api.deleteReminder(id);
  }

  // ============ WHATSAPP ============
  async sendWhatsApp(data: { phone: string; message: string; lead_id?: string }): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot send WhatsApp while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/whatsapp/send`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to send WhatsApp');
    return response.json();
  }

  async getWhatsAppLogs(): Promise<any[]> {
    const online = await this.isOnline();
    if (!online) {
      return [];
    }
    return this.fetchFromNetwork('/api/whatsapp/logs');
  }

  // ============ UTILITY ============
  async checkOnlineStatus(): Promise<boolean> {
    return this.isOnline();
  }
}

export const offlineApi = new OfflineApiService();
