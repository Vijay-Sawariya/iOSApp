export const REMINDER_FREQUENCIES = [
  { value: 'daily', label: 'Once a day — at the set time' },
  { value: 'five_minutes_before', label: 'Daily — 5 minutes before the set time' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'four_hourly', label: 'Every 4 hours' },
  { value: 'twice_daily', label: 'Twice a day — set time and 5 PM' },
  { value: 'off', label: 'Stop notifications' },
] as const;
export type ReminderFrequency = typeof REMINDER_FREQUENCIES[number]['value'];

// Dates are absolute instants; the second daily slot is always 5 PM in India.
export function reminderDelays(due: number, now: number, frequency: string, count = 24): number[] {
  if (frequency === 'off') return [];
  const start = due - (frequency === 'five_minutes_before' ? 300000 : 0);
  const interval = frequency === 'hourly' ? 3600000 : frequency === 'four_hourly' ? 14400000 : 86400000;
  const slots = new Set<number>();
  const first = start + Math.max(0, Math.ceil((now + 1000 - start) / interval)) * interval;
  for (let i = 0; i < count; i++) slots.add(first + i * interval);
  if (frequency === 'twice_daily') {
    const indiaDay = Math.floor((due + 19800000) / 86400000) * 86400000;
    let second = indiaDay + 17 * 3600000 - 19800000;
    second += Math.max(0, Math.ceil((Math.max(due, now + 1000) - second) / 86400000)) * 86400000;
    for (let i = 0; i < count; i++) slots.add(second + i * 86400000);
  }
  return [...slots].sort((a,b) => a-b).slice(0,count).map(at => Math.max(1, Math.ceil((at-now)/1000)));
}
