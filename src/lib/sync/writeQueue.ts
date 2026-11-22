import type { StockChange } from '../types.ts';

export type WriteQueueOptions = {
  /** Persists one batch (e.g. a single upsert). Rejecting reports the batch through onError. */
  flush: (changes: StockChange[]) => Promise<void>;
  /** Called with the failed batch so the caller can roll back optimistic state and show a toast. */
  onError: (changes: StockChange[], error: unknown) => void;
  delayMs?: number;
};

export type WriteQueue = {
  enqueue: (cardId: string, qty: number) => void;
  flushNow: () => Promise<void>;
};

export const DEFAULT_DELAY_MS = 600;

/** Coalesces per-card changes (last value wins) and flushes one batch after a quiet period. */
export function createWriteQueue({ flush, onError, delayMs = DEFAULT_DELAY_MS }: WriteQueueOptions): WriteQueue {
  const pending = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function flushNow(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (pending.size === 0) return;
    const batch: StockChange[] = [...pending].map(([cardId, qty]) => ({ cardId, qty }));
    pending.clear();
    try {
      await flush(batch);
    } catch (error) {
      onError(batch, error);
    }
  }

  function enqueue(cardId: string, qty: number): void {
    pending.set(cardId, qty);
    clearTimeout(timer);
    timer = setTimeout(() => void flushNow(), delayMs);
  }

  return { enqueue, flushNow };
}
