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

/** Match the web LMS: floor prices take priority; metadata edits never change this date. */
export function inventoryPriceUpdatedOn(lead: any): string | null {
  const floors = lead.floor_pricing || [];
  const amounts = floors.length ? floors.map((price: any) => price.floor_amount)
    : [Number(lead.budget_max) || lead.budget_min];
  if (!amounts.some((amount: any) => Number(amount) > 0)) return null;
  return lead.price_updated_on || lead.created_at || null;
}
