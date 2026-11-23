import type { StockChange } from '../types.ts';
import { withTimeout } from './timeout.ts';

export type WriteQueueOptions = {
  /**
   * Persists one batch (e.g. a single upsert). Rejecting reports the batch through onError.
   * `signal` aborts when the batch exceeds `timeoutMs`; pass it to the request.
   */
  flush: (changes: StockChange[], signal: AbortSignal) => Promise<void>;
  /** Called with the failed batch so the caller can roll back optimistic state and show a toast. */
  onError: (changes: StockChange[], error: unknown) => void;
  delayMs?: number;
  /** A batch still unsettled after this long fails (and is rolled back) so the queue moves on. */
  timeoutMs?: number;
};

export type WriteQueue = {
  enqueue: (cardId: string, qty: number) => void;
  /** Sends pending changes now; resolves once every batch queued so far has settled. */
  flushNow: () => Promise<void>;
  /** True when the card has a value waiting for a future batch (newer than any in flight). */
  isPending: (cardId: string) => boolean;
};

export const DEFAULT_DELAY_MS = 600;
export const DEFAULT_SAVE_TIMEOUT_MS = 8_000;

/**
 * Coalesces per-card changes (last value wins) and flushes one batch after a quiet period.
 * Batches are serialized: at most one is in flight, so writes reach the server in order and
 * a slow older batch can never overwrite a newer value. Each batch is bounded by `timeoutMs`
 * so a hung request cannot block later saves, sign-out or a user switch.
 */
export function createWriteQueue({
  flush,
  onError,
  delayMs = DEFAULT_DELAY_MS,
  timeoutMs = DEFAULT_SAVE_TIMEOUT_MS,
}: WriteQueueOptions): WriteQueue {
  const pending = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tail: Promise<void> = Promise.resolve();

  async function sendPending(): Promise<void> {
    if (pending.size === 0) return;
    const batch: StockChange[] = [...pending].map(([cardId, qty]) => ({ cardId, qty }));
    pending.clear();
    const controller = new AbortController();
    try {
      await withTimeout(flush(batch, controller.signal), timeoutMs, () => controller.abort());
    } catch (error) {
      onError(batch, error);
    }
  }

  function flushNow(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const run = tail.then(sendPending);
    tail = run.catch(() => undefined); // a throwing onError must not wedge later batches
    return run;
  }

  function enqueue(cardId: string, qty: number): void {
    pending.set(cardId, qty);
    clearTimeout(timer);
    timer = setTimeout(() => void flushNow(), delayMs);
  }

  return { enqueue, flushNow, isPending: (cardId) => pending.has(cardId) };
}
