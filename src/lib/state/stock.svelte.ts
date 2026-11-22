import { adjustQty, clampQty } from '../domain/stock.ts';
import { createWriteQueue } from '../sync/writeQueue.ts';
import type { StockChange } from '../types.ts';

export type StockStoreDeps = {
  fetchStock: () => Promise<Record<string, number>>;
  save: (changes: StockChange[], signal?: AbortSignal) => Promise<void>;
  delayMs?: number;
};

export const SAVE_ERROR = 'Could not save your changes. They were reverted.';
export const LOAD_ERROR = 'Could not load your stock.';

/** Optimistic own-stock state: edits show instantly, a coalescing queue persists them, failures roll back. */
export function createStockStore({ fetchStock, save, delayMs }: StockStoreDeps) {
  let quantities = $state<Record<string, number>>({});
  let loaded = $state(false);
  let error = $state<string | null>(null);
  /** Last values known to be persisted; rollback target. */
  const saved: Record<string, number> = {};

  const queue = createWriteQueue({
    delayMs,
    flush: async (changes, signal) => {
      await save(changes, signal);
      for (const c of changes) saved[c.cardId] = c.qty;
    },
    onError: (changes) => {
      // A card edited again after this batch left keeps its newer value: it is still queued.
      for (const c of changes) {
        if (!queue.isPending(c.cardId)) quantities[c.cardId] = saved[c.cardId] ?? 0;
      }
      error = SAVE_ERROR;
    },
  });

  function set(cardId: string, qty: number): void {
    const next = clampQty(qty);
    quantities[cardId] = next;
    queue.enqueue(cardId, next);
  }

  return {
    get loaded() {
      return loaded;
    },
    get error() {
      return error;
    },
    qty: (cardId: string): number => quantities[cardId] ?? 0,
    async load(): Promise<void> {
      try {
        const initial = await fetchStock();
        quantities = { ...initial };
        for (const [id, q] of Object.entries(initial)) saved[id] = q;
        loaded = true;
      } catch {
        error = LOAD_ERROR;
      }
    },
    adjust: (cardId: string, delta: number): void => set(cardId, adjustQty(quantities[cardId] ?? 0, delta)),
    set,
    flush: () => queue.flushNow(),
    dismissError(): void {
      error = null;
    },
  };
}

export type StockStore = ReturnType<typeof createStockStore>;
