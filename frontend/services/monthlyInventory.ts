export type MonthlyEntry = {
  inventory_status?: 'Available' | 'Sold' | 'Hold' | 'Invalid';
  id: number; book_month: string; category: string; location: string; address: string;
  area_size: string | number | null; area_unit: string; floor: string; configuration: string;
  owner_name: string; phone: string; note: string; entry_status: string; needs_review: boolean;
  converted_lead_id: number | null; matching_lead_id: number | null; pdf_id: number | null;
};
export type MonthlyInventoryPage = { items: MonthlyEntry[]; total: number; page: number; has_more: boolean; months: string[]; locations?: string[] };

// Preserve combined floor labels, matching MonthlyInventoryConversion::floors on web.
export function bookFloors(raw: string): string {
  const value = (raw || '').trim().toUpperCase().replace(/\s*\+\s*/g, '+')
    .replace(/TERRACE/g, 'TERR').replace(/TERR/g, 'Terr')
    .replace(/BMT\+GF/g, 'BMT_GF').replace(/TF\+Terr/g, 'TF_Terr');
  return [...new Set(value.split(/[+,]/).map(f => f.trim().replace(/_/g, '+')).filter(Boolean))].join(',');
}
export function conversionParams(entry: MonthlyEntry): Record<string, string> {
  const rent = entry.category.endsWith('_rent');
  return {
    monthlyEntryId: String(entry.id), initialLeadType: 'builder', type: 'inventory',
    name: (entry.owner_name || '').toLowerCase().replace(/(^|[\s('-])(\p{L})/gu, (_, prefix, letter) => prefix + letter.toUpperCase()), phone: (entry.phone || '').split(',')[0].trim(), location: entry.location || '',
    address: entry.address || '', floor: bookFloors(entry.floor), bhk: (entry.configuration || '').replace(/(\d+)BR/gi, '$1 BHK').replace(/\+/g, ','),
    areaSize: entry.area_size == null ? '' : String(entry.area_size), areaUnit: entry.area_unit || 'YD',
    unit: rent ? 'K' : 'CR', notes: '', propertyType: entry.category.startsWith('commercial_') ? 'Commercial' : 'Builder Floor',
  };
}

// Empty numeric query parameters are rejected by the API; preserve explicit zero.
export function monthlyInventoryQuery(filters: Record<string, string | number | string[] | undefined>): string {
  return Object.entries(filters)
    .flatMap(([key, value]) => (Array.isArray(value) ? value : [value])
      .filter(item => item !== undefined && String(item).trim() !== '')
      .map(item => `${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`)).join('&');
}
