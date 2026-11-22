/** Upper bound for flushing pending writes before sign-out or a user switch. */
export const FLUSH_TIMEOUT_MS = 10_000;

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Settles like `promise`, or rejects with a TimeoutError after `ms`. `onTimeout` runs when the
 * bound is hit (e.g. to abort the underlying request). The timer is cleared once settled.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new TimeoutError(ms));
    }, ms);
  });
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer));
}

/**
 * Best-effort flush that never blocks the caller for more than `ms` and never rejects:
 * sign-out and user switches must proceed even if the network is stalled or failing.
 * Failed batches are already rolled back and reported by the write queue itself.
 */
export async function flushWithin(flush: (() => Promise<void>) | undefined, ms: number = FLUSH_TIMEOUT_MS): Promise<void> {
  if (!flush) return;
  try {
    await withTimeout(flush(), ms);
  } catch {
    // Timed out or failed: continue anyway (see above).
  }
}
