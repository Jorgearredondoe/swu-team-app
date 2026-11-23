import type { Card } from '../types.ts';

export const sampleCards: Card[] = [
  { id: 'ASH-7', setCode: 'ASH', number: 7, name: 'Zeb Orrelios', subtitle: 'Spectre Four', rarity: 'Rare', type: 'Unit', imageUrl: 'https://img.test/ash7.png' },
  { id: 'LAW-32', setCode: 'LAW', number: 32, name: 'Cad Bane', subtitle: 'Now It Is My Turn', rarity: 'Legendary', type: 'Unit', imageUrl: 'https://img.test/law32.png' },
  { id: 'LAW-1', setCode: 'LAW', number: 1, name: 'Saw Gerrera', subtitle: 'Bring Down the Empire', rarity: 'Rare', type: 'Leader', imageUrl: 'https://img.test/law1.png' },
  { id: 'HMW-3', setCode: 'HMW', number: 3, name: 'Hera Syndulla', subtitle: null, rarity: 'Legendary', type: 'Leader', imageUrl: 'https://img.test/hmw3.png' },
];
