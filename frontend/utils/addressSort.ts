// Numeric comparison keeps A-2 before A-10, including sub-house numbers.
const addresses = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const sortByAddress = <T extends { id: number; address?: string | null }>(items: T[]): T[] =>
  [...items].sort((a, b) => {
    const left = (a.address || '').trim();
    const right = (b.address || '').trim();
    return Number(!left) - Number(!right) || addresses.compare(left, right) || a.id - b.id;
  });
