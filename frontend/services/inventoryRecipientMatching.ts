// Inventory-to-client defaults mirror the web recipient search.
export function recipientFiltersFromLead(lead: any) {
  const asNumber = (value: any) => value === null || value === undefined || value === '' ? NaN : Number(value);
  const split = (value: any): string[] => String(value ?? '').split(',').map((part) => part.trim()).filter(Boolean);
  let area = asNumber(lead?.area_size);
  const unit = String(lead?.area_unit || 'YD').trim().toUpperCase();
  area *= ({ SQFT: 1 / 9, SQM: 1.1959900463, ACRE: 4840 } as Record<string, number>)[unit] ?? 1;
  area = Math.round(area * 100) / 100;
  const pricing = Array.isArray(lead?.floor_pricing) ? lead.floor_pricing : [];
  const prices = pricing.map((row: any) => asNumber(row.floor_amount)).filter((amount: number) => Number.isFinite(amount) && amount > 0);
  const min = prices.length ? Math.min(...prices) : asNumber(lead?.budget_min);
  const max = prices.length ? Math.max(...prices) : asNumber(lead?.budget_max);
  return {
    locations: split(lead?.location),
    floors: Array.from(new Set([...split(lead?.floor), ...pricing.flatMap((row: any) => split(row.floor_label))])),
    area_min: Number.isFinite(area) && area > 0 ? String(Math.max(0, area - 50)) : '',
    area_max: Number.isFinite(area) && area > 0 ? String(area + 50) : '',
    budget_min: Number.isFinite(min) && min > 0 ? String(min) : '',
    budget_max: Number.isFinite(max) && max > 0 ? String(max) : '',
  };
}
