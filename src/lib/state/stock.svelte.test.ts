import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStockStore } from './stock.svelte.ts';
import type { StockChange } from '../types.ts';

function setup(initial: Record<string, number> = {}, saveImpl?: (c: StockChange[]) => Promise<void>) {
  const save = vi.fn(saveImpl ?? (async () => {}));
  const store = createStockStore({ fetchStock: async () => initial, save, delayMs: 600 });
  return { store, save };
}

describe('stock store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('loads own quantities and reports 0 for unknown cards', async () => {
    const { store } = setup({ 'LAW-1': 2 });
    await store.load();
    expect(store.loaded).toBe(true);
    expect(store.qty('LAW-1')).toBe(2);
    expect(store.qty('ASH-7')).toBe(0);
  });

  it('applies +/- optimistically and never goes below 0', async () => {
    const { store } = setup({ 'LAW-1': 1 });
    await store.load();
    store.adjust('LAW-1', 1);
    expect(store.qty('LAW-1')).toBe(2);
    store.adjust('LAW-1', -5);
    expect(store.qty('LAW-1')).toBe(0);
  });

  it('batches rapid clicks into one write with the final value', async () => {
    const { store, save } = setup({ 'LAW-1': 0 });
    await store.load();
    store.adjust('LAW-1', 1);
    store.adjust('LAW-1', 1);
    store.adjust('ASH-7', 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual([
      { cardId: 'LAW-1', qty: 2 },
      { cardId: 'ASH-7', qty: 1 },
    ]);
  });

  it('rolls back to the last saved value and reports an error when the write fails', async () => {
    const { store } = setup({ 'LAW-1': 2 }, async () => {
      throw new Error('denied');
    });
    await store.load();
    store.adjust('LAW-1', 3);
    expect(store.qty('LAW-1')).toBe(5);
    await vi.advanceTimersByTimeAsync(600);
    expect(store.qty('LAW-1')).toBe(2);
    expect(store.error).toBe('Could not save your changes. They were reverted.');
    store.dismissError();
    expect(store.error).toBeNull();
  });

  it('keeps a successful write as the new rollback point', async () => {
    let fail = false;
    const { store } = setup({}, async () => {
      if (fail) throw new Error('x');
    });
    await store.load();
    store.adjust('LAW-1', 2);
    await vi.advanceTimersByTimeAsync(600);
    fail = true;
    store.adjust('LAW-1', 1);
    await vi.advanceTimersByTimeAsync(600);
    expect(store.qty('LAW-1')).toBe(2);
  });

  it('flush() saves pending changes immediately', async () => {
    const { store, save } = setup();
    await store.load();
    store.adjust('LAW-1', 1);
    await store.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('exposes the load error instead of throwing', async () => {
    const store = createStockStore({
      fetchStock: async () => {
        throw new Error('network');
      },
      save: async () => {},
    });
    await store.load();
    expect(store.loaded).toBe(false);
    expect(store.error).toBe('Could not load your stock.');
  });

  it('does not roll back a card that has a newer pending value when an older batch fails', async () => {
    const results: { resolve: () => void; reject: (e: unknown) => void }[] = [];
    const save = vi.fn((_changes: StockChange[]) => new Promise<void>((resolve, reject) => results.push({ resolve, reject })));
    const store = createStockStore({ fetchStock: async () => ({ 'LAW-1': 1, 'ASH-7': 1 }), save, delayMs: 600 });
    await store.load();
    store.set('LAW-1', 3);
    store.set('ASH-7', 4);
    await vi.advanceTimersByTimeAsync(600); // batch 1 in flight: LAW-1=3, ASH-7=4
    store.set('LAW-1', 5); // newer pending value for LAW-1 only
    results[0].reject(new Error('timeout'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.qty('LAW-1')).toBe(5); // kept: the newer value is still going to be saved
    expect(store.qty('ASH-7')).toBe(1); // rolled back: nothing newer pending
    expect(store.error).toBe('Could not save your changes. They were reverted.');
    await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0]).toEqual([{ cardId: 'LAW-1', qty: 5 }]);
    results[1].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.qty('LAW-1')).toBe(5);
  });
});
