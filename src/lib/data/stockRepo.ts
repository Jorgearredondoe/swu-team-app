import type { StockChange } from '../types.ts';
import type { DbClient } from './db.ts';
import { fetchAllPages } from './paging.ts';

type StockRow = { card_id: string; qty: number };

/** Own stock only: RLS limits `stock` reads to team members, so the caller filters by user id. */
export async function fetchMyStock(client: DbClient, userId?: string): Promise<Record<string, number>> {
  const rows = await fetchAllPages<StockRow>(async (from, to) => {
    let query = client.from('stock').select('card_id,qty').order('card_id');
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query.range(from, to);
    if (error) throw new Error(error.message);
    return (data ?? []) as StockRow[];
  });
  return Object.fromEntries(rows.map((r) => [r.card_id, r.qty]));
}

export async function saveStockChanges(client: DbClient, userId: string, changes: StockChange[]): Promise<void> {
  if (changes.length === 0) return;
  const rows = changes.map((c) => ({ user_id: userId, card_id: c.cardId, qty: c.qty }));
  const { error } = await client.from('stock').upsert(rows, { onConflict: 'user_id,card_id' });
  if (error) throw new Error(error.message);
}
