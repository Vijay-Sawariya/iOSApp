// Background replacements can reorder variable-height rows and change the
// visible inventory. Hold only the latest snapshot until the reader returns
// to the top; an explicit refresh always takes effect immediately.
export const createDeferredListUpdates = <T>(apply: (data: T) => void) => {
  let offset = 0;
  let interacting = false;
  let initialized = false;
  let pending: { data: T } | null = null;
  const flush = () => {
    if (pending && offset <= 0 && !interacting) {
      const { data } = pending;
      pending = null;
      apply(data);
    }
  };
  return {
    receive(data: T, explicit = false) {
      if (initialized && !explicit && (offset > 0 || interacting)) {
        pending = { data };
        return;
      }
      initialized = true;
      pending = null;
      apply(data);
    },
    onScroll(y: number) { offset = y; flush(); },
    beginInteraction() { interacting = true; },
    endInteraction(y: number) { offset = y; interacting = false; flush(); },
  };
};
