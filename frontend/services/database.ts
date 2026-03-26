// Web version of database - returns empty/no-op functions
// SQLite is not available on web

export const isSQLiteAvailable = (): boolean => false;

export const initDatabase = async (): Promise<void> => {
  console.log('SQLite not available on web platform');
};

export const getDatabase = (): any => null;

export const clearAllData = async (): Promise<void> => {};

export const saveLeads = async (leads: any[]): Promise<void> => {};

export const saveFloorPricing = async (leadId: number, pricing: any[]): Promise<void> => {};

export const saveBuilders = async (builders: any[]): Promise<void> => {};

export const saveFollowups = async (leadId: number, followups: any[]): Promise<void> => {};

export const getLocalClientLeads = async (): Promise<any[]> => [];

export const getLocalInventoryLeads = async (): Promise<any[]> => [];

export const getLocalLead = async (id: number): Promise<any | null> => null;

export const getLocalFollowups = async (leadId: number): Promise<any[]> => [];

export const getLocalBuilders = async (): Promise<any[]> => [];

export const getLocalBuilder = async (id: number): Promise<any | null> => null;

export const setSyncMetadata = async (key: string, value: string): Promise<void> => {};

export const getSyncMetadata = async (key: string): Promise<string | null> => null;

export const getLastSyncTime = async (): Promise<Date | null> => null;

export const updateLastSyncTime = async (): Promise<void> => {};

export const getLeadCount = async (): Promise<{ clients: number; inventory: number }> => ({ clients: 0, inventory: 0 });

export const getBuilderCount = async (): Promise<number> => 0;
