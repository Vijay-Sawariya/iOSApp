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
import { getAuthToken } from './api';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  async getClientLeads(): Promise<any[]> {
    const online = await this.isOnline();
    
    if (online) {
      try {
        return await this.fetchFromNetwork('/api/leads/clients');
      } catch (error) {
        console.log('Network fetch failed, falling back to SQLite');
        return syncService.getClientLeads();
      }
    }
    
    // Offline - use SQLite
    return syncService.getClientLeads();
  }

  // ============ INVENTORY LEADS ============
  async getInventoryLeads(): Promise<any[]> {
    const online = await this.isOnline();
    
    if (online) {
      try {
        return await this.fetchFromNetwork('/api/leads/inventory');
      } catch (error) {
        console.log('Network fetch failed, falling back to SQLite');
        return syncService.getInventoryLeads();
      }
    }
    
    // Offline - use SQLite
    return syncService.getInventoryLeads();
  }

  // ============ SINGLE LEAD ============
  async getLead(id: string | number): Promise<any | null> {
    const online = await this.isOnline();
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    
    if (online) {
      try {
        return await this.fetchFromNetwork(`/api/leads/${id}`);
      } catch (error) {
        console.log('Network fetch failed, falling back to SQLite');
        return syncService.getLead(numericId);
      }
    }
    
    // Offline - use SQLite
    return syncService.getLead(numericId);
  }

  // ============ BUILDERS ============
  async getBuilders(): Promise<any[]> {
    const online = await this.isOnline();
    
    if (online) {
      try {
        return await this.fetchFromNetwork('/api/builders');
      } catch (error) {
        console.log('Network fetch failed, falling back to SQLite');
        return syncService.getBuilders();
      }
    }
    
    // Offline - use SQLite
    return syncService.getBuilders();
  }

  // ============ SINGLE BUILDER ============
  async getBuilder(id: string | number): Promise<any | null> {
    const online = await this.isOnline();
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    
    if (online) {
      try {
        return await this.fetchFromNetwork(`/api/builders/${id}`);
      } catch (error) {
        console.log('Network fetch failed, falling back to SQLite');
        return syncService.getBuilder(numericId);
      }
    }
    
    // Offline - use SQLite
    return syncService.getBuilder(numericId);
  }

  // ============ FOLLOWUPS/CONVERSATIONS ============
  async getLeadFollowups(leadId: string | number): Promise<any[]> {
    const online = await this.isOnline();
    const numericId = typeof leadId === 'string' ? parseInt(leadId, 10) : leadId;
    
    if (online) {
      try {
        return await this.fetchFromNetwork(`/api/leads/${leadId}/followups`);
      } catch (error) {
        console.log('Network fetch failed, falling back to SQLite');
        return syncService.getFollowups(numericId);
      }
    }
    
    // Offline - use SQLite
    return syncService.getFollowups(numericId);
  }

  // ============ DASHBOARD STATS ============
  async getDashboardStats(): Promise<any> {
    const online = await this.isOnline();
    
    if (online) {
      try {
        return await this.fetchFromNetwork('/api/dashboard/stats');
      } catch (error) {
        console.log('Network fetch failed, falling back to SQLite');
        return syncService.getDashboardStats();
      }
    }
    
    // Offline - use SQLite
    return syncService.getDashboardStats();
  }

  // ============ WRITE OPERATIONS (Always require network) ============
  
  async createLead(data: any): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot create lead while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/leads`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create lead');
    return response.json();
  }

  async updateLead(id: string, data: any): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot update lead while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/leads/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update lead');
    return response.json();
  }

  async deleteLead(id: string): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot delete lead while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/leads/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    
    if (!response.ok) {
      let errorMsg = 'Failed to delete lead';
      try {
        const errorData = await response.json();
        errorMsg = errorData.detail || errorMsg;
      } catch {}
      throw new Error(errorMsg);
    }
    
    return response.json();
  }

  async createBuilder(data: any): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot create builder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/builders`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create builder');
    return response.json();
  }

  async updateBuilder(id: string, data: any): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot update builder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/builders/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update builder');
    return response.json();
  }

  async deleteBuilder(id: string): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot delete builder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/builders/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete builder');
    return response.json();
  }

  async createFollowup(leadId: string, data: any): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot create followup while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/leads/${leadId}/followups`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ...data, lead_id: parseInt(leadId) }),
    });
    if (!response.ok) throw new Error('Failed to create followup');
    return response.json();
  }

  // ============ REMINDERS ============
  async getReminders(): Promise<any[]> {
    const online = await this.isOnline();
    if (!online) {
      // Reminders not cached in SQLite currently
      return [];
    }
    return this.fetchFromNetwork('/api/reminders');
  }

  async createReminder(data: any): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot create reminder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/reminders`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create reminder');
    return response.json();
  }

  async updateReminder(id: string, data: any): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot update reminder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/reminders/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update reminder');
    return response.json();
  }

  async deleteReminder(id: string): Promise<any> {
    const online = await this.isOnline();
    if (!online) {
      throw new Error('Cannot delete reminder while offline. Please connect to the internet.');
    }
    
    const response = await fetch(`${API_URL}/api/reminders/${id}`, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete reminder');
    return response.json();
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
