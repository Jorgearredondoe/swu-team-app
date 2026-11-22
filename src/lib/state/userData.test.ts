import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLUSH_TIMEOUT_MS } from '../sync/timeout.ts';
import { createUserDataLoader, type UserData, type UserStock } from './userData.ts';
import type { Card } from '../types.ts';

const card = (id: string): Card =>
  ({ id, setCode: 'LAW', number: 1, name: id, subtitle: null, rarity: 'Rare', type: 'Unit', imageUrl: '' });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeStock(userId: string) {
  return { userId, load: vi.fn(async () => {}), flush: vi.fn(async () => {}) } satisfies UserStock & { userId: string };
}

function setup(fetchCards: (userId: string) => Promise<Card[]>) {
  const states: UserData[] = [];
  const stocks: ReturnType<typeof fakeStock>[] = [];
  const loader = createUserDataLoader({
    fetchCards,
    createStock: (userId) => {
      const s = fakeStock(userId);
      stocks.push(s);
      return s;
    },
    onChange: (s) => states.push(s),
  });
  return { loader, states, stocks, last: () => states.at(-1) };
}

describe('createUserDataLoader', () => {
  it('loads catalog then stock for the signed-in user', async () => {
    const { loader, last, stocks } = setup(async () => [card('LAW-1')]);
    await loader.switchTo('u1');
    expect(last()).toMatchObject({ status: 'ready', cards: [card('LAW-1')] });
    expect(stocks).toHaveLength(1);
    expect(stocks[0].load).toHaveBeenCalledTimes(1);
  });

  it('reports ready with no stock when RLS returns an empty catalog (not on the team)', async () => {
    const { loader, last, stocks } = setup(async () => []);
    await loader.switchTo('u1');
    expect(last()).toEqual({ status: 'ready', cards: [], stock: null });
    expect(stocks).toHaveLength(0);
  });

  it('reports a retryable error on a transient catalog failure, and retry recovers', async () => {
    let fail = true;
    const { loader, last } = setup(async () => {
      if (fail) throw new Error('network');
      return [card('LAW-1')];
    });
    await loader.switchTo('u1');
    expect(last()).toEqual({ status: 'error' });
    fail = false;
    await loader.retry();
    expect(last()).toMatchObject({ status: 'ready', cards: [card('LAW-1')] });
  });

  it('does nothing when the same user is switched to again', async () => {
    const fetchCards = vi.fn(async () => [card('LAW-1')]);
    const { loader } = setup(fetchCards);
    await loader.switchTo('u1');
    await loader.switchTo('u1');
    expect(fetchCards).toHaveBeenCalledTimes(1);
  });

  it('ignores a superseded run that finishes after a newer one', async () => {
    const slow = deferred<Card[]>();
    const { loader, last, stocks } = setup((userId) => (userId === 'u1' ? slow.promise : Promise.resolve([card('ASH-7')])));
    const first = loader.switchTo('u1');
    await loader.switchTo('u2');
    slow.resolve([card('LAW-1')]);
    await first;
    expect(last()).toMatchObject({ status: 'ready', cards: [card('ASH-7')] });
    expect(stocks.map((s) => s.userId)).toEqual(['u2']);
  });

  it('flushes the previous user stock before replacing it, and on sign-out', async () => {
    const { loader, stocks, last } = setup(async () => [card('LAW-1')]);
    await loader.switchTo('u1');
    await loader.switchTo('u2');
    expect(stocks[0].flush).toHaveBeenCalledTimes(1);
    expect(stocks[1].flush).not.toHaveBeenCalled();
    await loader.switchTo(null);
    expect(stocks[1].flush).toHaveBeenCalledTimes(1);
    expect(last()).toEqual({ status: 'idle' });
  });

  describe('hung previous flush', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('loads the next user after the flush bound instead of waiting forever', async () => {
      const { loader, stocks, last } = setup(async () => [card('LAW-1')]);
      await loader.switchTo('u1');
      stocks[0].flush.mockImplementationOnce(() => new Promise<void>(() => {}));
      const switching = loader.switchTo('u2');
      await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS);
      await switching;
      expect(last()).toMatchObject({ status: 'ready', cards: [card('LAW-1')] });
      expect(stocks.map((s) => s.userId)).toEqual(['u1', 'u2']);
    });

    it('settles sign-out after the flush bound', async () => {
      const { loader, stocks, last } = setup(async () => [card('LAW-1')]);
      await loader.switchTo('u1');
      stocks[0].flush.mockImplementationOnce(() => new Promise<void>(() => {}));
      let done = false;
      void loader.switchTo(null).then(() => (done = true));
      await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS);
      expect(done).toBe(true);
      expect(last()).toEqual({ status: 'idle' });
    });
  });
});
