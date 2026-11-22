import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushWithin, withTimeout } from './timeout.ts';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('withTimeout', () => {
  it('resolves with the value when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(7), 100)).resolves.toBe(7);
  });

  it('rejects with a timeout error when the promise stalls', async () => {
    const result = withTimeout(new Promise(() => {}), 100);
    const assertion = expect(result).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('calls onTimeout when it fires (e.g. to abort the request)', async () => {
    const onTimeout = vi.fn();
    const result = withTimeout(new Promise(() => {}), 100, onTimeout).catch(() => undefined);
    await vi.advanceTimersByTimeAsync(99);
    expect(onTimeout).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});

describe('flushWithin', () => {
  it('waits for a flush that finishes in time', async () => {
    let flushed = false;
    const flush = () =>
      new Promise<void>((res) =>
        setTimeout(() => {
          flushed = true;
          res();
        }, 50),
      );
    const done = flushWithin(flush, 100);
    await vi.advanceTimersByTimeAsync(50);
    await done;
    expect(flushed).toBe(true);
  });

  it('gives up on a hung flush after the bound instead of blocking the caller', async () => {
    let done = false;
    void flushWithin(() => new Promise<void>(() => {}), 100).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('never rejects: a failed flush still lets the caller continue', async () => {
    await expect(flushWithin(() => Promise.reject(new Error('net')), 100)).resolves.toBeUndefined();
  });

  it('accepts a missing flush (no store yet)', async () => {
    await expect(flushWithin(undefined, 100)).resolves.toBeUndefined();
  });
});
