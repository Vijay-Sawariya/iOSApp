import * as SQLite from 'expo-sqlite';

// Database instance
let db: SQLite.SQLiteDatabase | null = null;
let isInitialized = false;

// Check if SQLite is available (native only)
export const isSQLiteAvailable = (): boolean => true;

// Initialize database - must be called before using any database functions
export const initDatabase = async (): Promise<void> => {
  if (isInitialized) return;
  
  try {
    db = await SQLite.openDatabaseAsync('sagarhomelms.db');
    
    // Create tables
    await db.execAsync(`
      -- Leads table
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY,
        name TEXT,
        phone TEXT,
        email TEXT,
        lead_type TEXT,
        lead_temperature TEXT,
        lead_status TEXT,
        location TEXT,
        address TEXT,
        property_type TEXT,
        bhk TEXT,
        floor TEXT,
        area_size REAL,
        budget_min REAL,
        budget_max REAL,
        unit TEXT,
        car_parking_number TEXT,
        lift_available TEXT,
        building_facing TEXT,
        notes TEXT,
        Property_locationUrl TEXT,
        created_at TEXT,
        updated_at TEXT,
        synced_at TEXT
      );

      -- Builders table
      CREATE TABLE IF NOT EXISTS builders (
        id INTEGER PRIMARY KEY,
        builder_name TEXT,
        company_name TEXT,
        phone TEXT,
        address TEXT,
        created_at TEXT,
        synced_at TEXT
      );

      -- Floor pricing table
      CREATE TABLE IF NOT EXISTS floor_pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER,
        floor_label TEXT,
        floor_amount REAL,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      );

      -- Followups table
      CREATE TABLE IF NOT EXISTS followups (
        id INTEGER PRIMARY KEY,
        lead_id INTEGER,
        channel TEXT,
        outcome TEXT,
        notes TEXT,
        followup_date TEXT,
        next_followup TEXT,
        created_at TEXT,
        FOREIGN KEY (lead_id) REFERENCES leads(id)
      );

      -- Sync metadata table
      CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- Pending write operations created while offline
      CREATE TABLE IF NOT EXISTS pending_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        local_entity_id INTEGER,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_error TEXT
      );
    `);
    
    isInitialized = true;
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    isInitialized = true; // Mark as initialized to not retry
    throw error;
  }
};

// Get database instance
export const getDatabase = (): any => {
  if (!isSQLiteAvailable()) {
    return null;
  }
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
};

// Clear all data (for fresh sync)
export const clearAllData = async (): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;
  
  await database.execAsync(`
    DELETE FROM floor_pricing;
    DELETE FROM followups;
    DELETE FROM leads;
    DELETE FROM builders;
  `);
};

// Save leads to local database
export const saveLeads = async (leads: any[]): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;
  
  const syncedAt = new Date().toISOString();
  
  for (const lead of leads) {
    await database.runAsync(
      `INSERT OR REPLACE INTO leads (
        id, name, phone, email, lead_type, lead_temperature, lead_status,
        location, address, property_type, bhk, floor, area_size,
        budget_min, budget_max, unit, car_parking_number, lift_available,
        building_facing, notes, Property_locationUrl, created_at, updated_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lead.id, lead.name, lead.phone, lead.email, lead.lead_type,
        lead.lead_temperature, lead.lead_status, lead.location, lead.address,
        lead.property_type, lead.bhk, lead.floor, lead.area_size,
        lead.budget_min, lead.budget_max, lead.unit, lead.car_parking_number,
        lead.lift_available, lead.building_facing, lead.notes,
        lead.Property_locationUrl, lead.created_at, lead.updated_at, syncedAt
      ]
    );
  }
};

// Save floor pricing
export const saveFloorPricing = async (leadId: number, pricing: any[]): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;
  
  // Delete existing pricing for this lead
  await database.runAsync('DELETE FROM floor_pricing WHERE lead_id = ?', [leadId]);
  
  // Insert new pricing
  for (const fp of pricing) {
    await database.runAsync(
      'INSERT INTO floor_pricing (lead_id, floor_label, floor_amount) VALUES (?, ?, ?)',
      [leadId, fp.floor_label, fp.floor_amount]
    );
  }
};

// Save builders to local database
export const saveBuilders = async (builders: any[]): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;
  
  const syncedAt = new Date().toISOString();
  
  for (const builder of builders) {
    await database.runAsync(
      `INSERT OR REPLACE INTO builders (
        id, builder_name, company_name, phone, address, created_at, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        builder.id, builder.builder_name, builder.company_name,
        builder.phone, builder.address, builder.created_at, syncedAt
      ]
    );
  }
};

// Save followups to local database
export const saveFollowups = async (leadId: number, followups: any[]): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;
  
  // Delete existing followups for this lead
  await database.runAsync('DELETE FROM followups WHERE lead_id = ?', [leadId]);
  
  // Insert new followups
  for (const followup of followups) {
    await database.runAsync(
      `INSERT OR REPLACE INTO followups (
        id, lead_id, channel, outcome, notes, followup_date, next_followup, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        followup.id, leadId, followup.channel, followup.outcome,
        followup.notes, followup.followup_date, followup.next_followup, followup.created_at
      ]
    );
  }
};

// Get all client leads from local database
export const getLocalClientLeads = async (): Promise<any[]> => {
  if (!isSQLiteAvailable()) return [];
  const database = getDatabase();
  if (!database) return [];
  
  const result = await database.getAllAsync(
    `SELECT * FROM leads WHERE lead_type IN ('buyer', 'tenant') ORDER BY created_at DESC`
  );
  return result;
};

// Get all inventory leads from local database
export const getLocalInventoryLeads = async (): Promise<any[]> => {
  if (!isSQLiteAvailable()) return [];
  const database = getDatabase();
  if (!database) return [];
  
  const leads = await database.getAllAsync(
    `SELECT * FROM leads WHERE lead_type IN ('seller', 'landlord', 'builder') ORDER BY created_at DESC`
  );
  
  // Get floor pricing for each lead
  for (const lead of leads as any[]) {
    const pricing = await database.getAllAsync(
      'SELECT floor_label, floor_amount FROM floor_pricing WHERE lead_id = ?',
      [lead.id]
    );
    lead.floor_pricing = pricing;
  }
  
  return leads;
};

// Get single lead from local database
export const getLocalLead = async (id: number): Promise<any | null> => {
  if (!isSQLiteAvailable()) return null;
  const database = getDatabase();
  if (!database) return null;
  
  const result = await database.getFirstAsync(
    'SELECT * FROM leads WHERE id = ?',
    [id]
  );
  
  if (result) {
    // Get floor pricing
    const pricing = await database.getAllAsync(
      'SELECT floor_label, floor_amount FROM floor_pricing WHERE lead_id = ?',
      [id]
    );
    (result as any).floor_pricing = pricing;
  }
  
  return result;
};

// Get followups from local database
export const getLocalFollowups = async (leadId: number): Promise<any[]> => {
  if (!isSQLiteAvailable()) return [];
  const database = getDatabase();
  if (!database) return [];
  
  const result = await database.getAllAsync(
    'SELECT * FROM followups WHERE lead_id = ? ORDER BY created_at DESC',
    [leadId]
  );
  return result;
};

// Get all builders from local database
export const getLocalBuilders = async (): Promise<any[]> => {
  if (!isSQLiteAvailable()) return [];
  const database = getDatabase();
  if (!database) return [];
  
  const result = await database.getAllAsync(
    'SELECT * FROM builders ORDER BY builder_name ASC'
  );
  return result;
};

// Get single builder from local database
export const getLocalBuilder = async (id: number): Promise<any | null> => {
  if (!isSQLiteAvailable()) return null;
  const database = getDatabase();
  if (!database) return null;
  
  const result = await database.getFirstAsync(
    'SELECT * FROM builders WHERE id = ?',
    [id]
  );
  return result;
};

// Save sync metadata
export const setSyncMetadata = async (key: string, value: string): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;
  
  await database.runAsync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    [key, value]
  );
};

// Get sync metadata
export const getSyncMetadata = async (key: string): Promise<string | null> => {
  if (!isSQLiteAvailable()) return null;
  const database = getDatabase();
  if (!database) return null;
  
  const result = await database.getFirstAsync(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [key]
  ) as { value: string } | null;
  return result?.value || null;
};

// Get last sync time
export const getLastSyncTime = async (): Promise<Date | null> => {
  const timestamp = await getSyncMetadata('last_sync');
  return timestamp ? new Date(timestamp) : null;
};

// Update last sync time
export const updateLastSyncTime = async (): Promise<void> => {
  await setSyncMetadata('last_sync', new Date().toISOString());
};

export const queuePendingLeadCreate = async (lead: any): Promise<any> => {
  if (!isSQLiteAvailable()) return { ...lead, is_pending_sync: true };
  const database = getDatabase();
  if (!database) return { ...lead, is_pending_sync: true };

  const now = new Date().toISOString();
  const localId = -Date.now();
  const localLead = {
    ...lead,
    id: localId,
    created_at: now,
    updated_at: now,
    is_pending_sync: true,
  };

  await database.runAsync(
    `INSERT OR REPLACE INTO leads (
      id, name, phone, email, lead_type, lead_temperature, lead_status,
      location, address, property_type, bhk, floor, area_size,
      budget_min, budget_max, unit, car_parking_number, lift_available,
      building_facing, notes, Property_locationUrl, created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      localId, lead.name, lead.phone, lead.email || null, lead.lead_type,
      lead.lead_temperature, lead.lead_status, lead.location, lead.address,
      lead.property_type, lead.bhk, lead.floor, lead.area_size,
      lead.budget_min, lead.budget_max, lead.unit, lead.car_parking_number,
      lead.lift_available, lead.building_facing, lead.notes,
      lead.Property_locationUrl, now, now, null
    ]
  );

  if (lead.floor_pricing && Array.isArray(lead.floor_pricing)) {
    for (const fp of lead.floor_pricing) {
      await database.runAsync(
        'INSERT INTO floor_pricing (lead_id, floor_label, floor_amount) VALUES (?, ?, ?)',
        [localId, fp.floor || fp.floor_label, parseFloat(fp.price || fp.floor_amount || 0)]
      );
    }
  }

  await database.runAsync(
    `INSERT INTO pending_operations (
      operation_type, entity_type, local_entity_id, payload, created_at
    ) VALUES (?, ?, ?, ?, ?)`,
    ['create', 'lead', localId, JSON.stringify(lead), now]
  );

  return localLead;
};

export const getPendingOperations = async (): Promise<any[]> => {
  if (!isSQLiteAvailable()) return [];
  const database = getDatabase();
  if (!database) return [];

  return database.getAllAsync(
    'SELECT * FROM pending_operations ORDER BY created_at ASC'
  );
};

export const deletePendingOperation = async (id: number): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;

  await database.runAsync('DELETE FROM pending_operations WHERE id = ?', [id]);
};

export const markPendingOperationError = async (id: number, error: string): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;

  await database.runAsync(
    'UPDATE pending_operations SET last_error = ? WHERE id = ?',
    [error, id]
  );
};

export const removeLocalLead = async (id: number): Promise<void> => {
  if (!isSQLiteAvailable()) return;
  const database = getDatabase();
  if (!database) return;

  await database.runAsync('DELETE FROM floor_pricing WHERE lead_id = ?', [id]);
  await database.runAsync('DELETE FROM leads WHERE id = ?', [id]);
};

export const getPendingOperationCount = async (): Promise<number> => {
  if (!isSQLiteAvailable()) return 0;
  const database = getDatabase();
  if (!database) return 0;

  const result = await database.getFirstAsync(
    'SELECT COUNT(*) as count FROM pending_operations'
  ) as { count: number } | null;
  return result?.count || 0;
};

// Get lead count
export const getLeadCount = async (): Promise<{ clients: number; inventory: number }> => {
  if (!isSQLiteAvailable()) return { clients: 0, inventory: 0 };
  const database = getDatabase();
  if (!database) return { clients: 0, inventory: 0 };
  
  const clientResult = await database.getFirstAsync(
    `SELECT COUNT(*) as count FROM leads WHERE lead_type IN ('buyer', 'tenant')`
  ) as { count: number } | null;
  const inventoryResult = await database.getFirstAsync(
    `SELECT COUNT(*) as count FROM leads WHERE lead_type IN ('seller', 'landlord', 'builder')`
  ) as { count: number } | null;
  return {
    clients: clientResult?.count || 0,
    inventory: inventoryResult?.count || 0
  };
};

// Get builder count
export const getBuilderCount = async (): Promise<number> => {
  if (!isSQLiteAvailable()) return 0;
  const database = getDatabase();
  if (!database) return 0;
  
  const result = await database.getFirstAsync(
    'SELECT COUNT(*) as count FROM builders'
  ) as { count: number } | null;
  return result?.count || 0;
};
