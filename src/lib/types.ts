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
