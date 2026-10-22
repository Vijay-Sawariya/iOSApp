export function inventoryPropertyCategory(value?: string | null): 'commercial' | 'residential' | null {
  const type = (value || '').trim().toLowerCase();
  if (['commercial', 'office space', 'shop'].includes(type)) return 'commercial';
  if (['residential', 'builder floor', 'apartment', 'plot', 'villa', 'kothi', 'farm house'].includes(type)) return 'residential';
  return null;
}
export function matchesInventoryPropertyFilter(lead: any, filter: string): boolean {
  if (!filter) return true;
  const category = inventoryPropertyCategory(lead.property_type);
  const rent = filter.endsWith('_rent');
  return category === (filter.startsWith('commercial_') ? 'commercial' : 'residential') &&
    (rent ? ['landlord', 'rent', 'agent'] : ['seller', 'builder', 'owner', 'agent']).includes((lead.lead_type || '').toLowerCase());
}
export function hasUnpricedInventory(lead: any): boolean {
  return Number(lead.budget_min || 0) === 0 && Number(lead.budget_max || 0) === 0 &&
    !(lead.floor_pricing || []).some((price: any) => Number(price.floor_amount || 0) > 0);
}
