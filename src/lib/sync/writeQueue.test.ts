import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWriteQueue } from './writeQueue.ts';
import type { StockChange } from '../types.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createWriteQueue', () => {
  it('flushes once, 600 ms after the last change', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = createWriteQueue({ flush, onError: vi.fn() });
    queue.enqueue('LAW-1', 1);
    await vi.advanceTimersByTimeAsync(599);
    expect(flush).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([{ cardId: 'LAW-1', qty: 1 }]);
  });

  it('coalesces repeated changes to the same card into the last value, one batch', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = createWriteQueue({ flush, onError: vi.fn() });
    queue.enqueue('LAW-1', 1);
    await vi.advanceTimersByTimeAsync(300);
    queue.enqueue('LAW-1', 2);
    queue.enqueue('LAW-32', 4);
    await vi.advanceTimersByTimeAsync(300);
    expect(flush).not.toHaveBeenCalled(); // debounce restarted by the latest change
    await vi.advanceTimersByTimeAsync(300);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith([
      { cardId: 'LAW-1', qty: 2 },
      { cardId: 'LAW-32', qty: 4 },
    ]);
  });

  it('does not flush again when nothing new was queued', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = createWriteQueue({ flush, onError: vi.fn() });
    queue.enqueue('LAW-1', 1);
    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(5000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('reports the failed batch and the error so the caller can roll back', async () => {
    const boom = new Error('rls denied');
    const flush = vi.fn().mockRejectedValue(boom);
    const onError = vi.fn();
    const queue = createWriteQueue({ flush, onError });
    queue.enqueue('LAW-1', 3);
    await vi.advanceTimersByTimeAsync(600);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith([{ cardId: 'LAW-1', qty: 3 }], boom);
  });

  it('keeps working after a failure', async () => {
    const flush = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(undefined);
    const queue = createWriteQueue({ flush, onError: vi.fn() });
    queue.enqueue('LAW-1', 3);
    await vi.advanceTimersByTimeAsync(600);
    queue.enqueue('LAW-1', 4);
    await vi.advanceTimersByTimeAsync(600);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenLastCalledWith([{ cardId: 'LAW-1', qty: 4 }]);
  });

  it('flushNow sends pending changes immediately and cancels the timer', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = createWriteQueue({ flush, onError: vi.fn() });
    queue.enqueue('LAW-1', 5);
    await queue.flushNow();
    expect(flush).toHaveBeenCalledWith([{ cardId: 'LAW-1', qty: 5 }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('honours a custom delay', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const queue = createWriteQueue({ flush, onError: vi.fn(), delayMs: 50 });
    queue.enqueue('LAW-1', 1);
    await vi.advanceTimersByTimeAsync(50);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  describe('single in-flight flush', () => {
    function deferredFlush() {
      const calls: { changes: StockChange[]; resolve: () => void; reject: (e: unknown) => void }[] = [];
      const flush = vi.fn(
        (changes: StockChange[]) =>
          new Promise<void>((resolve, reject) => calls.push({ changes, resolve, reject })),
      );
      return { flush, calls };
    }

    it('never starts a batch while another is in flight, and sends later batches in order', async () => {
      const { flush, calls } = deferredFlush();
      const queue = createWriteQueue({ flush, onError: vi.fn() });
      queue.enqueue('LAW-1', 1);
      await vi.advanceTimersByTimeAsync(600);
      queue.enqueue('LAW-1', 2);
      await vi.advanceTimersByTimeAsync(600);
      void queue.flushNow();
      await vi.advanceTimersByTimeAsync(0);
      expect(flush).toHaveBeenCalledTimes(1);
      calls[0].resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(flush).toHaveBeenCalledTimes(2);
      expect(calls.map((c) => c.changes)).toEqual([[{ cardId: 'LAW-1', qty: 1 }], [{ cardId: 'LAW-1', qty: 2 }]]);
    });

    it('flushNow resolves only after the in-flight and the pending batch are done', async () => {
      const { flush, calls } = deferredFlush();
      const queue = createWriteQueue({ flush, onError: vi.fn() });
      queue.enqueue('LAW-1', 1);
      await vi.advanceTimersByTimeAsync(600);
      queue.enqueue('ASH-7', 1);
      let done = false;
      const flushed = queue.flushNow().then(() => (done = true));
      calls[0].resolve();
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(false);
      calls[1].resolve();
      await flushed;
      expect(done).toBe(true);
    });

    it('reports whether a card has a newer pending value', async () => {
      const { flush, calls } = deferredFlush();
      const queue = createWriteQueue({ flush, onError: vi.fn() });
      queue.enqueue('LAW-1', 1);
      expect(queue.isPending('LAW-1')).toBe(true);
      await vi.advanceTimersByTimeAsync(600);
      expect(queue.isPending('LAW-1')).toBe(false);
      queue.enqueue('LAW-1', 2);
      expect(queue.isPending('LAW-1')).toBe(true);
      expect(queue.isPending('ASH-7')).toBe(false);
      calls[0].resolve();
    });
  });
});
