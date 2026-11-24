export type ProviderDetails = { listing_id: string; response_id: string; location: string; configuration: string; budget: string; message: string; listing_url: string };
const text = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
export function enquiryProviderDetails(item: any): ProviderDetails {
  const payload = item.current && typeof item.current === 'object' ? item.current : item.original || {};
  const provider = payload.provider_fields || {};
  const qa: Record<string, string> = {};
  if (Array.isArray(payload.questions) && Array.isArray(payload.answers)) {
    payload.questions.forEach((question: unknown, index: number) => {
      qa[text(question).toLowerCase().replace(/_/g, ' ')] = text(payload.answers[index]);
    });
  }
  const lead = payload.parsed_lead || {};
  const candidate = text(provider.listing_URL ?? lead.listing_URL ?? payload.listing_URL ?? item.listing_url);
  let url = '';
  try { const parsed = new URL(candidate); if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) url = candidate; } catch {}
  const fallback: ProviderDetails = { listing_id: text(provider.listing_id), response_id: text(provider.response_id), location: text(provider.location) || text(lead.location) || qa.location || '', configuration: text(provider.configuration) || text(lead.bhk) || qa.configuration || '', budget: text(provider.budget) || `${text(lead.budget_max)} ${text(lead.unit)}`.trim() || qa.budget || '', message: [provider.message, provider.complete_message, payload.message, lead.meta_enquiry_text].map(text).find(Boolean) || '', listing_url: url };
  // Compact responses from older servers may only include Q&A; recover those
  // fields even when an empty provider_details object is present.
  const result = { ...fallback };
  for (const key of Object.keys(fallback) as (keyof ProviderDetails)[]) {
    if (item.provider_details && key in item.provider_details) {
      const value = text(item.provider_details[key]);
      if (value || key === 'listing_url') result[key] = value;
    }
  }
  return result;
}
function words(value: number): string {
  const small = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  if (value < 20) return small[value];
  for (const [scale, label] of [[10000000,'Crore'],[100000,'Lac'],[1000,'Thousand'],[100,'Hundred']] as const) {
    if (value >= scale) return `${words(Math.floor(value / scale))} ${label}${value % scale ? ` ${words(value % scale)}` : ''}`;
  }
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${small[value % 10]}` : ''}`;
}
export function formatEnquiryBudget(input: unknown): { figures: string; words: string } {
  const raw = text(input);
  const match = raw.match(/^(\d+(?:,\d+)*(?:\.\d{1,2})?)\s*(CR|CRORES?|L|LACS?|LAKHS?|K|THOUSANDS?)?$/i);
  if (!match) return { figures: raw, words: '' };
  const unit = (match[2] || '').toUpperCase();
  const multiplier = /^(CR|CRORE)/.test(unit) ? 10000000 : /^(L|LAC|LAKH)/.test(unit) ? 100000 : /^(K|THOUSAND)/.test(unit) ? 1000 : 1;
  const amount = Number(match[1].replace(/,/g, '')) * multiplier;
  if (!Number.isFinite(amount) || amount < 0 || amount > 99999900000) return { figures: raw, words: '' };
  const totalPaise = Math.round(amount * 100), whole = Math.floor(totalPaise / 100), paise = totalPaise % 100;
  const digits = String(whole);
  const grouped = digits.length > 3 ? `${digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${digits.slice(-3)}` : digits;
  return { figures: `₹${grouped}${paise ? `.${String(paise).padStart(2, '0')}` : ''}`, words: `${words(whole)}${paise ? ` Rupees and ${words(paise)} Paise` : ''}` };
}
