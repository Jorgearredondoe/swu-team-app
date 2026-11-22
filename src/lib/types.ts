export const SET_CODES = ['LAW', 'ASH', 'HMW', 'IC27'] as const;
export type SetCode = (typeof SET_CODES)[number];
export type Rarity = 'Rare' | 'Legendary';

export type Card = {
  id: string;
  setCode: SetCode;
  number: number;
  name: string;
  subtitle: string | null;
  rarity: Rarity;
  type: string;
  imageUrl: string;
};

export type TeamRow = { cardId: string; userId: string; displayName: string; qty: number };
export type TeamCardTotal = { cardId: string; total: number; byMember: Record<string, number> };
export type ExportV1 = { version: 1; exportedAt: string; cards: Card[]; stock: TeamRow[] };
export type StockChange = { cardId: string; qty: number };
