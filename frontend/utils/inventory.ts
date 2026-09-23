import { Lead, normalizeSearchText } from '../constants/leadOptions';

const closedStatuses = new Set(['sold', 'notavailable']);
export const isUnavailableInventory = (lead: Lead) =>
  (lead.lead_status || '').split(/[,|/]/).some(status => closedStatuses.has(normalizeSearchText(status)));

// A name, phone, or locality search must not bring closed properties back.
export const canShowInventory = (lead: Lead, search: string, statuses: string[] = [], addressFilter = '') => {
  if (!isUnavailableInventory(lead)) return true;
  const query = normalizeSearchText(search);
  const ownStatuses = (lead.lead_status || '').split(/[,|/]/).map(normalizeSearchText);
  const statusSearch = closedStatuses.has(query) && ownStatuses.includes(query);
  const explicitStatus = statuses.some(status => closedStatuses.has(normalizeSearchText(status)) && ownStatuses.includes(normalizeSearchText(status)));
  const address = normalizeSearchText(lead.address || '');
  const addressSearch = [query, normalizeSearchText(addressFilter)].some(value => value.length > 0 && /[a-z0-9]/i.test(address) && address.includes(value));
  return statusSearch || explicitStatus || addressSearch;
};

const floorNames: Record<string, string> = {
  BMT: 'Basement', GF: 'Ground Floor', UGF: 'Upper Ground Floor', FF: 'First Floor',
  SF: 'Second Floor', TF: 'Third Floor', 'TF+TERR': 'Third Floor + Terrace', 'BMT+GF': 'Basement + Ground Floor',
};
const floorLabel = (floor: string) => floorNames[floor.replace(/\s/g, '').toUpperCase()] || floor.trim() || 'Floor';
const amount = (value: string | number) => Number.isFinite(Number(value)) ? String(Number(Number(value).toFixed(2))) : String(value);

export const formatInventoryCopy = (lead: Lead, index = 1): string => {
  const size = `${lead.area_size ? amount(lead.area_size) : 'NA'} Sq. Yds.`;
  const location = lead.location?.trim() || 'NA';
  const floor = (lead.floor || '').split(/[,|]/).filter(Boolean).map(floorLabel).join(' | ');
  const bedrooms = (lead.bhk || '').split(/[,|]/).map(value => {
    const match = value.trim().match(/^(\d+)(\+?)\s*(?:BHK)?$/i);
    return match ? `${match[1]}${match[2]} ${match[1] === '1' && !match[2] ? 'Bedroom' : 'Bedrooms'}` : value.trim();
  }).filter(Boolean).join(' | ');
  const unitValue = (lead.unit || '').trim().toUpperCase();
  const unit = ['CR', 'CRORE', 'CRORES'].includes(unitValue) ? 'Cr' : ['L', 'LAC', 'LAKH', 'LAKHS'].includes(unitValue) ? 'Lac' : ['K', 'TH', 'THOUSAND'].includes(unitValue) ? 'Th' : unitValue;
  const price = (value: string | number) => `₹${amount(value)}${unit ? ` ${unit}` : ''} Negotiable`;
  const prices = (lead.floor_pricing || []).filter(p => p.floor_amount != null).map(p => `${floorLabel(p.floor_label)}: ${price(p.floor_amount)}`);
  if (!prices.length) {
    const budget = lead.budget_max ?? lead.budget_min;
    prices.push(`Ask: ${budget != null ? price(budget) : 'On Request Negotiable'}`);
  }
  return [
    `${String(index).padStart(2, '0')}-${lead.id}) ${size} At ${location}`,
    `Location: ${location}`,
    `Size: ${size}`,
    (floor || bedrooms) ? `Configuration: ${floor || 'NA'}${bedrooms ? ` | — ${bedrooms}` : ''}` : null,
    lead.car_parking_number != null ? `Parking: ${lead.car_parking_number} ${Number(lead.car_parking_number) === 1 ? 'Car' : 'Cars'}` : null,
    ...prices,
  ].filter(Boolean).join('\n');
};
