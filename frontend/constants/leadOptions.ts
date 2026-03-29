// Lead Management Constants
// Centralized constants used across lead forms and filters

export const LEAD_TYPES = ['buyer', 'tenant', 'seller', 'landlord', 'builder'] as const;
export type LeadType = typeof LEAD_TYPES[number];

// Client-specific lead types
export const CLIENT_LEAD_TYPES = ['buyer', 'tenant', 'agent'] as const;
export const INVENTORY_LEAD_TYPES = ['seller', 'landlord', 'builder'] as const;

export const LEAD_TEMPERATURES = ['Hot', 'Warm', 'Cold'] as const;
export type LeadTemperature = typeof LEAD_TEMPERATURES[number];

export const CLIENT_STATUSES = ['New', 'Contacted', 'Qualified', 'Negotiating', 'Won', 'Lost'] as const;
export const INVENTORY_STATUSES = ['Under construction', 'Ready to move', 'Near Completion', 'Booking', 'Old', 'Sold'] as const;

export const PROPERTY_TYPES = ['Apartment', 'Builder Floor', 'Plot', 'Vila'] as const;

export const BHK_OPTIONS = ['1 BHK', '2 BHK', '3 BHK', '4 BHK', '5 BHK', '5+ BHK', 'Hall', 'Plot', 'Kothi', 'Farm House'] as const;

export const UNITS = ['CR', 'L', 'K'] as const;

// Added Plot and Kothi to floor options
export const FLOORS = ['BMT', 'BMT+GF', 'GF', 'FF', 'SF', 'TF', 'TF+Terr', 'Plot', 'Kothi'] as const;

export const FACINGS = ['South', 'North', 'East', 'West', 'Southeast', 'Southwest', 'Northeast', 'Northwest'] as const;

export const LIFT_OPTIONS = ['Yes', 'No'] as const;

// Additional amenities from database schema
export const AMENITIES = [
  { key: 'park_facing', label: 'Park Facing' },
  { key: 'park_at_rear', label: 'Park at Rear' },
  { key: 'wide_road', label: 'Wide Road' },
  { key: 'peaceful_location', label: 'Peaceful Location' },
  { key: 'main_road', label: 'Main Road' },
  { key: 'corner', label: 'Corner Plot' },
] as const;

// Locations sorted alphabetically
export const LOCATIONS = [
  "Anand Lok", "Anand Niketan", "Andrews Ganj", "Basant Lok DDA Complex",
  "Bhikaji Cama Place", "Chanakyapuri", "Chattapur Farm", "Chirag Enclave",
  "CR Park", "Defence Colony", "East of Kailash", "Friends Colony",
  "Friends Colony East", "Friends Colony West", "Geetanjali Enclave",
  "Golf Links", "Green Park", "Green Park Extension", "Gulmohar Park",
  "Hamdard Nagar", "Hanuman Road", "Hauz Khas", "Hauz Khas Enclave",
  "Hemkunt colony", "Jangpura Extension", "Jor Bagh", "Jor Bagh Enclave",
  "Kailash Colony", "Kalkaji", "Kalkaji Enclave", "Kashmere Gate",
  "Kashmere Gate Enclave", "Lajpat Nagar", "Lajpat Nagar- III", "Lodi Colony",
  "Lodi Road", "Maharani Bagh", "Malcha Marg", "Malviya Nagar",
  "Masjid Moth", "Maurice Nagar", "Munirka Vihar", "National Park",
  "Navjeevan Vihar", "Neeti Bagh", "Nehru Enclave", "New Friends Colony",
  "Nizamuddin East", "Nizamuddin West", "Pamposh Enclave", "Panchsheel Enclave",
  "Panchsheel Park", "Pashmi Marg", "Rajdoot Marg", "Safdarjung Enclave",
  "Saket", "Sarvapriya Vihar", "Sarvodaya Enclave", "SDA", "Shanti Niketan",
  "Shivalik", "Soami Nagar", "South Ex 1", "South Ex 2", "Sukhdev Vihar",
  "Sultanpur Farms", "Sunder Nagar", "Uday Park", "Vasant Kunj", "West End"
] as const;

// Filter Status Options (includes 'Any')
export const FILTER_STATUSES = ['Any', ...INVENTORY_STATUSES] as const;
export const FILTER_FACINGS = ['Any', ...FACINGS] as const;

// Type guards
export const isClientType = (type: string | null): boolean => {
  return type === 'buyer' || type === 'tenant' || type === 'agent';
};

export const isInventoryType = (type: string | null): boolean => {
  return type === 'seller' || type === 'landlord' || type === 'builder';
};

// Color mappings
export const getTypeColor = (type: string | null): { bg: string; text: string } => {
  switch (type) {
    case 'buyer': return { bg: '#DBEAFE', text: '#1E40AF' };
    case 'tenant': return { bg: '#FEF3C7', text: '#92400E' };
    case 'agent': return { bg: '#FCE7F3', text: '#9D174D' };
    case 'seller': return { bg: '#DCFCE7', text: '#166534' };
    case 'landlord': return { bg: '#FEF3C7', text: '#92400E' };
    case 'builder': return { bg: '#E0E7FF', text: '#3730A3' };
    default: return { bg: '#F3F4F6', text: '#374151' };
  }
};

export const getTemperatureColor = (temp: string | null): string => {
  switch (temp?.toLowerCase()) {
    case 'hot': return '#EF4444';
    case 'warm': return '#F59E0B';
    case 'cold': return '#3B82F6';
    default: return '#9CA3AF';
  }
};

// Format helpers
export const formatUnit = (unit: string | null): string => {
  if (!unit) return '';
  switch (unit.toUpperCase()) {
    case 'CR': return ' Cr';
    case 'L': return ' L';
    case 'K':
    case 'TH': return ' K';
    default: return ` ${unit}`;
  }
};

// Normalize text for flexible search matching
// "F18", "F 18", "F-18", "F- 18", "F -18" all become "f18"
export const normalizeSearchText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\s\-]+/g, '') // Remove spaces and hyphens
    .trim();
};

export const formatBudget = (budgetMin: number | null, budgetMax: number | null, unit: string | null): string => {
  if (!budgetMin && !budgetMax) return '';
  const unitStr = formatUnit(unit);
  if (budgetMin && budgetMax) {
    return `₹${budgetMin}-${budgetMax}${unitStr}`;
  } else if (budgetMin) {
    return `₹${budgetMin}${unitStr}+`;
  } else if (budgetMax) {
    return `Up to ₹${budgetMax}${unitStr}`;
  }
  return '';
};

// Floor pricing interface
export interface FloorPrice {
  floor: string;
  price: string;
}

export interface FloorPricing {
  floor_label: string;
  floor_amount: number;
}

export const formatFloorPricing = (pricing?: FloorPricing[], unit?: string | null): string | null => {
  if (!pricing || pricing.length === 0) return null;
  const unitStr = formatUnit(unit);
  return pricing.map(p => `${p.floor_label}: ₹${p.floor_amount}${unitStr}`).join(' | ');
};

// Lead interface
export interface Lead {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  lead_type: string | null;
  lead_temperature: string | null;
  lead_status: string | null;
  location: string | null;
  address: string | null;
  property_type: string | null;
  unit: string | null;
  area_size: string | null;
  budget_min: number | null;
  budget_max: number | null;
  floor: string | null;
  building_facing: string | null;
  floor_pricing?: FloorPricing[];
  created_at?: string | null;
  created_by_name?: string | null;
  Property_locationUrl?: string | null;
}

// Builder interface
export interface Builder {
  id: string;
  builder_name: string;
  company_name: string;
  phone: string;
  address: string | null;
  created_by_name?: string | null;
}
