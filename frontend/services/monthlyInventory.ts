export type MonthlyEntry = {
  id: number; book_month: string; category: string; location: string; address: string;
  area_size: string | number | null; area_unit: string; floor: string; configuration: string;
  owner_name: string; phone: string; note: string; entry_status: string; needs_review: boolean;
  converted_lead_id: number | null; matching_lead_id: number | null; pdf_id: number | null;
};
export type MonthlyInventoryPage = { items: MonthlyEntry[]; total: number; page: number; has_more: boolean; months: string[] };

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
    monthlyEntryId: String(entry.id), initialLeadType: rent ? 'landlord' : 'seller', type: 'inventory',
    name: entry.owner_name || '', phone: (entry.phone || '').split(',')[0].trim(), location: entry.location || '',
    address: entry.address || '', floor: bookFloors(entry.floor), bhk: (entry.configuration || '').replace(/(\d+)BR/gi, '$1 BHK').replace(/\+/g, ','),
    areaSize: entry.area_size == null ? '' : String(entry.area_size), areaUnit: entry.area_unit || 'YD',
    unit: rent ? 'K' : 'CR', notes: entry.note || '', propertyType: entry.category.startsWith('commercial_') ? 'Commercial' : 'Builder Floor',
  };
}
