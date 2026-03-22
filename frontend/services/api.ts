const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

const getHeaders = () => ({
  'Content-Type': 'application/json',
  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
});

export const api = {
  // Dashboard
  getDashboardStats: async () => {
    const response = await fetch(`${API_URL}/api/dashboard/stats`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch stats');
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
    const response = await fetch(`${API_URL}/api/leads/clients`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch client leads');
    return response.json();
  },

  // Leads - Inventory (Seller, Landlord, Builder)
  getInventoryLeads: async () => {
    const response = await fetch(`${API_URL}/api/leads/inventory`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch inventory leads');
    return response.json();
  },

  getLead: async (id: string) => {
    const response = await fetch(`${API_URL}/api/leads/${id}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch lead');
    return response.json();
  },

  createLead: async (data: any) => {
    const response = await fetch(`${API_URL}/api/leads`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create lead');
    return response.json();
  },

  updateLead: async (id: string, data: any) => {
    const response = await fetch(`${API_URL}/api/leads/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update lead');
    return response.json();
  },

  deleteLead: async (id: string) => {
    const response = await fetch(`${API_URL}/api/leads/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete lead');
    return response.json();
  },

  // Builders
  getBuilders: async () => {
    const response = await fetch(`${API_URL}/api/builders`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch builders');
    return response.json();
  },

  getBuilder: async (id: string) => {
    const response = await fetch(`${API_URL}/api/builders/${id}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch builder');
    return response.json();
  },

  createBuilder: async (data: any) => {
    const response = await fetch(`${API_URL}/api/builders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create builder');
    return response.json();
  },

  updateBuilder: async (id: string, data: any) => {
    const response = await fetch(`${API_URL}/api/builders/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update builder');
    return response.json();
  },

  deleteBuilder: async (id: string) => {
    const response = await fetch(`${API_URL}/api/builders/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete builder');
    return response.json();
  },

  // Reminders
  getReminders: async () => {
    const response = await fetch(`${API_URL}/api/reminders`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch reminders');
    return response.json();
  },

  createReminder: async (data: any) => {
    const response = await fetch(`${API_URL}/api/reminders`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to create reminder');
    return response.json();
  },

  updateReminder: async (id: string, data: any) => {
    const response = await fetch(`${API_URL}/api/reminders/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update reminder');
    return response.json();
  },

  deleteReminder: async (id: string) => {
    const response = await fetch(`${API_URL}/api/reminders/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete reminder');
    return response.json();
  },

  // WhatsApp
  sendWhatsApp: async (data: { phone: string; message: string; lead_id?: string }) => {
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
};