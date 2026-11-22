import type { Card, Rarity, SetCode } from '../types.ts';
import type { DbClient } from './db.ts';
import { fetchAllPages } from './paging.ts';

type CardRow = {
  id: string;
  set_code: SetCode;
  card_number: number;
  name: string;
  subtitle: string | null;
  rarity: Rarity;
  card_type: string;
  image_url: string;
};

export const toCard = (r: CardRow): Card => ({
  id: r.id,
  setCode: r.set_code,
  number: r.card_number,
  name: r.name,
  subtitle: r.subtitle,
  rarity: r.rarity,
  type: r.card_type,
  imageUrl: r.image_url,
});

export async function fetchCards(client: DbClient): Promise<Card[]> {
  const rows = await fetchAllPages<CardRow>(async (from, to) => {
    const { data, error } = await client
      .from('cards')
      .select('id,set_code,card_number,name,subtitle,rarity,card_type,image_url')
      .order('id')
      .range(from, to);
    if (error) throw new Error(error.message);
    return (data ?? []) as CardRow[];
  });
  return rows.map(toCard);
}
