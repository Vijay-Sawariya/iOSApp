/** LMS timestamps without an offset are wall-clock times in Asia/Kolkata. */
export function formatEnquiryDate(value?: string | null): string {
  if (!value) return 'Not provided';
  const text = value.trim().replace(' ', 'T');
  const date = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text) ? `${text}+05:30` : text);
  if (!Number.isFinite(date.getTime())) return 'Not provided';
  // Format from UTC getters after applying IST explicitly. Some mobile Intl
  // implementations omit time parts when date and time options are combined.
  const ist = new Date(date.getTime() + 330 * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const hour = ist.getUTCHours();
  return `${pad(ist.getUTCDate())} ${months[ist.getUTCMonth()]} ${ist.getUTCFullYear()}, ${pad(hour % 12 || 12)}:${pad(ist.getUTCMinutes())} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export const enquiryStatusLabel = (status: string) => status === 'Invalid' ? 'Junk/Invalid' : status;
