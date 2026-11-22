import type { TeamRow } from '../types.ts';
import type { DbClient } from './db.ts';
import { fetchAllPages } from './paging.ts';

type TeamStockRow = { card_id: string; user_id: string; display_name: string; qty: number };

export async function fetchTeamRows(client: DbClient): Promise<TeamRow[]> {
  const rows = await fetchAllPages<TeamStockRow>(async (from, to) => {
    const { data, error } = await client
      .from('team_stock')
      .select('card_id,user_id,display_name,qty')
      .order('card_id')
      .order('user_id')
      .range(from, to);
    if (error) throw new Error(error.message);
    return (data ?? []) as TeamStockRow[];
  });
  return rows.map((r) => ({ cardId: r.card_id, userId: r.user_id, displayName: r.display_name, qty: r.qty }));
}
