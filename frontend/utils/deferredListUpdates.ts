// Background replacements can reorder variable-height rows and change the
// visible inventory. Hold only the latest snapshot until the reader returns
// to the top; an explicit refresh always takes effect immediately.
export const hasRemovedLeads = (previous: { id: number }[], next: { id: number }[]) => {
  const ids = new Set(next.map(lead => lead.id));
  return previous.some(lead => !ids.has(lead.id));
};

export const createDeferredListUpdates = <T>(apply: (data: T) => void, hasRemovals?: (previous: T, next: T) => boolean) => {
  let displayed: T;
  let offset = 0;
  let interacting = false;
  let initialized = false;
  let pending: { data: T } | null = null;
  const flush = () => {
    if (pending && offset <= 0 && !interacting) {
      const { data } = pending;
      pending = null;
      displayed = data;
      apply(data);
    }
  };
  return {
    receive(data: T, explicit = false) {
      // Deletions must disappear even when normal reordering is deferred.
      explicit = explicit || (initialized && !!hasRemovals?.(displayed, data));
      if (initialized && !explicit && (offset > 0 || interacting)) {
        pending = { data };
        return;
      }
      initialized = true;
      pending = null;
      displayed = data;
      apply(data);
    },
    onScroll(y: number) { offset = y; flush(); },
    beginInteraction() { interacting = true; },
    endInteraction(y: number) { offset = y; interacting = false; flush(); },
  };
};
