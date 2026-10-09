import { FloorPrice, Lead, getInventoryAskingPrice } from '../constants/leadOptions';

// Only assign an old overall ask to a floor when that assignment is unambiguous.
// A multi-floor property's total must never be copied onto every floor.
export const loadInventoryEditPricing = (lead: Lead): { floorPrices: FloorPrice[]; propertyPrice: string } => {
  const floorPrices = (lead.floor_pricing || []).map((row: any) => ({
    floor: String(row.floor_label ?? row.floor ?? '').trim(),
    price: String(row.floor_amount ?? row.price ?? ''),
  })).filter(row => Number.isFinite(Number(row.price)) && Number(row.price) > 0);
  if (floorPrices.length) return { floorPrices, propertyPrice: '' };
  const price = getInventoryAskingPrice(lead);
  if (price === null) return { floorPrices: [], propertyPrice: '' };
  const floors = Array.from(new Set((lead.floor || '').split(',').map(floor => floor.trim()).filter(Boolean)));
  return floors.length === 1
    ? { floorPrices: [{ floor: floors[0], price: String(price) }], propertyPrice: '' }
    : { floorPrices: [], propertyPrice: String(price) };
};

export const buildInventoryEditPricing = (rows: FloorPrice[], propertyPrice: string) => {
  const positive = (raw: string) => {
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value <= 0) {
      throw new Error('Enter a positive price for each floor.');
    }
    return value;
  };
  const seen = new Set<string>();
  const floor_pricing = rows.filter(row => row.floor.trim() || row.price.trim()).map(row => {
    const floor = row.floor.trim();
    if (!floor) throw new Error('Select a floor for each price.');
    if (seen.has(floor.toLowerCase())) throw new Error('Enter each floor only once.');
    seen.add(floor.toLowerCase());
    return { floor, price: String(positive(row.price)) };
  });
  const amounts = floor_pricing.map(row => Number(row.price));
  // The current schema supports an overall property price when no floor split
  // exists. Once floor prices are entered, they become the authoritative range.
  const overall = !amounts.length && propertyPrice.trim() ? positive(propertyPrice) : null;
  return {
    floor_pricing,
    budget_min: amounts.length ? Math.min(...amounts) : overall,
    budget_max: amounts.length ? Math.max(...amounts) : overall,
  };
};
