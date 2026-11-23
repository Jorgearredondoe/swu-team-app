import { flushWithin, FLUSH_TIMEOUT_MS } from '../sync/timeout.ts';
import type { Card } from '../types.ts';

/** The slice of the stock store the loader needs. */
export type UserStock = { load: () => Promise<void>; flush: () => Promise<void> };

export type UserData<S extends UserStock = UserStock> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; cards: Card[]; stock: S | null };

export type UserDataDeps<S extends UserStock> = {
  fetchCards: (userId: string) => Promise<Card[]>;
  createStock: (userId: string) => S;
  onChange: (data: UserData<S>) => void;
  /** Bound on flushing the previous user's writes before switching or signing out. */
  flushTimeoutMs?: number;
};

/**
 * Loads catalog + own stock for the signed-in user. Each switch supersedes the previous
 * run (late results are dropped), and the previous user's pending writes are flushed
 * (bounded by flushTimeoutMs) before its store is discarded. A catalog failure is reported as a retryable error;
 * only a successful, empty catalog means "not on the team".
 */
export function createUserDataLoader<S extends UserStock>({
  fetchCards,
  createStock,
  onChange,
  flushTimeoutMs = FLUSH_TIMEOUT_MS,
}: UserDataDeps<S>) {
  let currentUser: string | null = null;
  let currentStock: S | null = null;
  let run = 0;

  async function load(userId: string): Promise<void> {
    const mine = ++run;
    const stale = () => mine !== run;
    onChange({ status: 'loading' });
    let cards: Card[];
    try {
      cards = await fetchCards(userId);
    } catch {
      if (!stale()) onChange({ status: 'error' });
      return;
    }
    if (stale()) return;
    let stock: S | null = null;
    if (cards.length > 0) {
      stock = createStock(userId);
      await stock.load();
      if (stale()) return;
    }
    currentStock = stock;
    onChange({ status: 'ready', cards, stock });
  }

  return {
    async switchTo(userId: string | null): Promise<void> {
      if (userId === currentUser) return;
      currentUser = userId;
      const previous = currentStock;
      currentStock = null;
      if (userId === null) {
        run++;
        onChange({ status: 'idle' });
        await flushWithin(previous?.flush, flushTimeoutMs);
        return;
      }
      run++; // drop any in-flight load for the previous user
      onChange({ status: 'loading' });
      await flushWithin(previous?.flush, flushTimeoutMs);
      if (userId !== currentUser) return; // superseded while flushing
      await load(userId);
    },
    async retry(): Promise<void> {
      if (currentUser !== null) await load(currentUser);
    },
  };
}
