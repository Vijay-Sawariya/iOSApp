// Stored with each queue item so relaunching cannot restart a failed retry loop.
export type SyncFailure = { message: string; status?: number; attempts: number; retryAfter: number };

export const readSyncFailure = (value?: string | null): SyncFailure | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed.message === 'string' && typeof parsed.retryAfter === 'number') return parsed;
  } catch {}
  // Recover errors written by older TestFlight builds without deleting the item.
  const status = Number(value.match(/API error: (\d{3})/)?.[1]) || undefined;
  return { message: value, status, attempts: 1, retryAfter: 0 };
};

const requiresManualRetry = (status?: number) =>
  !!status && status >= 400 && status < 500 && ![408, 429].includes(status);

export const canAutomaticallyRetry = (value?: string | null, now = Date.now()): boolean => {
  const failure = readSyncFailure(value);
  return !failure || (!requiresManualRetry(failure.status) && now >= failure.retryAfter);
};

export const createSyncFailure = (error: { message?: string; status?: number }, previous?: string | null, now = Date.now()): SyncFailure => {
  const attempts = (readSyncFailure(previous)?.attempts || 0) + 1;
  return {
    message: error.message || 'Sync failed', status: error.status, attempts,
    retryAfter: now + Math.min(15 * 60 * 1000, 30000 * 2 ** Math.min(attempts - 1, 5)),
  };
};
