/** LMS timestamps without an offset are wall-clock times in Asia/Kolkata. */
export function formatEnquiryDate(value?: string | null): string {
  if (!value) return 'Not provided';
  const text = value.trim().replace(' ', 'T');
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text) ? `${text}+05:30` : text);
  if (!Number.isFinite(date.getTime())) return 'Not provided';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value || '';
  return `${part('day')} ${part('month')} ${part('year')}, ${part('hour')}:${part('minute')} ${part('dayPeriod').toUpperCase()}`;
}

export const enquiryStatusLabel = (status: string) => status === 'Invalid' ? 'Junk/Invalid' : status;
