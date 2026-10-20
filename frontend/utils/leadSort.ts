// Keep cached and live lists in the same creation order; edits do not move leads.
export const sortLeadsByCreatedAt = <T extends { id: number; created_at?: string | null }>(leads: T[]): T[] => {
  const time = (value?: string | null) => {
    if (!value) return 0;
    const parsed = Date.parse(value.includes('T') ? value : value.replace(' ', 'T'));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return [...leads].sort((a, b) => time(b.created_at) - time(a.created_at) || b.id - a.id);
};
