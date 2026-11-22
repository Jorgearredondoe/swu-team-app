import { SET_CODES, type Card, type Rarity, type SetCode } from '../types.ts';

export type CatalogFilter = { set?: SetCode; rarity?: Rarity; search?: string };
export type SortKey = 'set' | 'name';

export function filterCards(cards: readonly Card[], filter: CatalogFilter): Card[] {
  const needle = filter.search?.trim().toLowerCase() ?? '';
  return cards.filter((c) => {
    if (filter.set && c.setCode !== filter.set) return false;
    if (filter.rarity && c.rarity !== filter.rarity) return false;
    if (needle === '') return true;
    return `${c.name} ${c.subtitle ?? ''}`.toLowerCase().includes(needle);
  });
}

export function sortCards(cards: readonly Card[], key: SortKey = 'set'): Card[] {
  const bySet = (a: Card, b: Card) => SET_CODES.indexOf(a.setCode) - SET_CODES.indexOf(b.setCode) || a.number - b.number;
  const byName = (a: Card, b: Card) => a.name.localeCompare(b.name) || bySet(a, b);
  return [...cards].sort(key === 'name' ? byName : bySet);
}
