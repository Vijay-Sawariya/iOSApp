// Shared dropdown arrays are populated from the LMS catalogue by sharedDropdowns.ts.
// No per-app default values: offline data comes from the last downloaded catalogue.
// Lead Management Constants
// Centralized constants used across lead forms and filters

export const LEAD_TYPES = ['buyer', 'tenant', 'seller', 'landlord', 'builder', 'agent'] as const;
export type LeadType = typeof LEAD_TYPES[number];

// Client-specific lead types (for Client Add/Edit forms)
export const CLIENT_LEAD_TYPES = ['buyer', 'tenant'] as const;
// Inventory-specific lead types (for Inventory Add/Edit forms)
export const INVENTORY_LEAD_TYPES = ['builder', 'seller', 'landlord', 'agent'] as const;

export const LEAD_TEMPERATURES = ['Hot', 'Warm', 'Cold'] as const;
export type LeadTemperature = typeof LEAD_TEMPERATURES[number];

export const CLIENT_STATUSES = ['New', 'Hot', 'Pending', 'Warm', 'Cold', 'Follow Up', 'Closed/Lost'] as const;
export const INVENTORY_STATUSES = ['Available', 'Under Construction', 'Ready to Move', 'Near Completion', 'Booking', 'Old', 'Sold', 'Not Available', 'Already Rented'] as const;

// How Old options (in years)
export const HOW_OLD_OPTIONS = Array.from({ length: 50 }, (_, index) => String(index + 1));

export const PROPERTY_TYPES = ['Apartment', 'Builder Floor', 'Plot', 'Villa', 'Kothi', 'Commercial'] as const;

export const BHK_OPTIONS: string[] = [];

export const UNITS = ['CR', 'L', 'K'] as const;

// Shared floor options for forms and filters
export const FLOORS: string[] = [];

export const FACINGS: string[] = [];

export const LIFT_OPTIONS = ['Yes', 'No'] as const;

// Lead Source options
export const LEAD_SOURCES: string[] = [];
export type LeadSource = typeof LEAD_SOURCES[number];

// Additional amenities from database schema
export const AMENITIES: { key: string; label: string }[] = [];

// Locations in the administrator-defined shared order
export const LOCATIONS: string[] = [];

// Total location count
export let LOCATION_COUNT = 0;
export const updateLocationCount = () => { LOCATION_COUNT = LOCATIONS.length; };

// Filter Status Options (includes 'Any')
export const FILTER_STATUSES = ['Any', ...INVENTORY_STATUSES] as const;
export const FILTER_FACINGS: string[] = ['Any'];

// Type guards
export const isClientType = (type: string | null): boolean => {
  return type === 'buyer' || type === 'tenant';
};

export const isInventoryType = (type: string | null): boolean => {
  return type === 'seller' || type === 'owner' || type === 'landlord' || type === 'builder' || type === 'agent';
};

// Color mappings
export const getTypeColor = (type: string | null): { bg: string; text: string } => {
  switch (type) {
    case 'buyer': return { bg: '#DBEAFE', text: '#1E40AF' };
    case 'tenant': return { bg: '#FEF3C7', text: '#92400E' };
    case 'agent': return { bg: '#FCE7F3', text: '#9D174D' };
    case 'seller': return { bg: '#DCFCE7', text: '#166534' };
    case 'owner': return { bg: '#DCFCE7', text: '#166534' };
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
  const unitStr = formatUnit(unit ?? null);
  return pricing.map(p => `${p.floor_label}: ₹${p.floor_amount}${unitStr}`).join(' | ');
};

// Inventory can have either floor prices or a single asking price in budget_max.
const positivePrice = (value: unknown): number | null => {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
};

export const getInventoryAskingPrice = (lead: Pick<Lead, 'budget_max' | 'budget_min'>): number | null =>
  positivePrice(lead.budget_max) ?? positivePrice(lead.budget_min);

export const getInventoryPrices = (lead: Lead, floors: string[] = []): number[] => {
  const pricing = (lead.floor_pricing || []).filter(row => positivePrice(row.floor_amount) !== null);
  if (!pricing.length) {
    const askingPrice = getInventoryAskingPrice(lead);
    return askingPrice === null ? [] : [askingPrice];
  }
  return pricing.filter(row => !floors.length || floors.some(floor => {
    const label = normalizeSearchText(row.floor_label);
    const selected = normalizeSearchText(floor);
    return label.includes(selected) || selected.includes(label);
  })).map(row => Number(row.floor_amount));
};

export const formatInventoryPricing = (lead: Lead): string | null => {
  const pricing = (lead.floor_pricing || []).filter(row => positivePrice(row.floor_amount) !== null);
  if (pricing.length) return formatFloorPricing(pricing, lead.unit);
  const price = getInventoryAskingPrice(lead);
  return price === null ? null : `₹${price.toFixed(2)}${formatUnit(lead.unit)}`;
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
  area_unit?: string | null;
  bedroom_dimensions?: string | null;
  bedroom_dimension?: string | null;
  bedroom_size?: string | null;
  bed_room_dimensions?: string | null;
  bedroomDimension?: string | null;
  budget_min: number | null;
  budget_max: number | null;
  floor: string | null;
  bhk?: string | null;
  car_parking_number?: number | null;
  lift?: string | null;
  required_amenities?: string | null;
  park_facing?: number | boolean | string | null;
  park_at_rear?: number | boolean | string | null;
  wide_road?: number | boolean | string | null;
  peaceful_location?: number | boolean | string | null;
  main_road?: number | boolean | string | null;
  corner?: number | boolean | string | null;
  park?: number | boolean | string | null;
  gated_community?: number | boolean | string | null;
  sample_flat?: number | boolean | string | null;
  parking?: number | boolean | string | null;
  stilt?: number | boolean | string | null;
  building_facing: string | null;
  floor_pricing?: FloorPricing[];
  created_at?: string | null;
  updated_on?: string | null;
  updated_at?: string | null;
  created_by?: number | null;  // ID of the user who created this lead
  assigned_to?: number | null;
  current_assignee_id?: number | null;
  assigned_to_username?: string | null;
  assigned_to_name?: string | null;
  assignment_can_view_private?: boolean;
  can_view_sensitive?: boolean;
  detail_access_status?: 'pending' | 'approved' | 'declined' | null;
  created_by_name?: string | null;
  Property_locationUrl?: string | null;
  last_message_sent_on?: string | null;
  last_sent_message?: string | null;
  lead_source?: string | null;
  source_type?: string | null;
  whatsapp_sent_flag?: number | boolean | null;
  // Lead Scoring fields
  lead_score?: number | null;
  days_since_contact?: number | null;
  aging_label?: string | null;
  aging_color?: string | null;
  aging_urgency?: string | null;
  score_breakdown?: Array<[string, number, string]> | null;
}

// Helper functions for lead scoring UI
export const getScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return '#9CA3AF';
  if (score >= 80) return '#10B981'; // green
  if (score >= 60) return '#3B82F6'; // blue
  if (score >= 40) return '#F59E0B'; // amber
  return '#EF4444'; // red
};

export const getAgingStyles = (agingColor: string | null | undefined): { bg: string; text: string } => {
  switch (agingColor) {
    case 'green':
      return { bg: '#D1FAE5', text: '#059669' };
    case 'blue':
      return { bg: '#DBEAFE', text: '#2563EB' };
    case 'orange':
      return { bg: '#FEF3C7', text: '#D97706' };
    case 'red':
      return { bg: '#FEE2E2', text: '#DC2626' };
    case 'darkred':
      return { bg: '#FCA5A5', text: '#991B1B' };
    default:
      return { bg: '#F3F4F6', text: '#6B7280' };
  }
};

// Helper function to check if current user can view sensitive data (phone/address) for a lead
export const canViewSensitiveData = (
  userRole: string | undefined,
  userId: string | number | undefined,
  leadCreatedBy: number | null | undefined,
  leadAssignedTo?: number | null | undefined
): boolean => {
  // Admin can see everything
  if (userRole === 'admin') return true;
  
  if (!userId) return false;
  
  return (
    (leadCreatedBy != null && String(userId) === String(leadCreatedBy)) ||
    (leadAssignedTo != null && String(userId) === String(leadAssignedTo))
  );
};

// Helper function to mask phone number
export const maskPhone = (phone: string | null): string => {
  if (!phone) return '';
  return '**********';
};

// Helper function to mask address
export const maskAddress = (address: string | null, location: string | null): string => {
  const parts = [address, location].filter(Boolean);
  if (parts.length === 0) return '';
  return '**********';
};

// Builder interface
export interface Builder {
  id: string;
  builder_name: string;
  company_name: string;
  phone: string;
  address: string | null;
  created_by_name?: string | null;
}
