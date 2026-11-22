import { describe, expect, it } from 'vitest';
import { filterCards, sortCards } from './catalog.ts';
import { sampleCards } from './fixtures.ts';

const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe('filterCards', () => {
  it('returns every card when no filter is set', () => {
    expect(ids(filterCards(sampleCards, {}))).toEqual(['ASH-7', 'LAW-32', 'LAW-1', 'HMW-3']);
  });

  it('filters by set', () => {
    expect(ids(filterCards(sampleCards, { set: 'LAW' }))).toEqual(['LAW-32', 'LAW-1']);
    expect(ids(filterCards(sampleCards, { set: 'ASH' }))).toEqual(['ASH-7']);
  });

  it('filters by rarity', () => {
    expect(ids(filterCards(sampleCards, { rarity: 'Legendary' }))).toEqual(['LAW-32', 'HMW-3']);
    expect(ids(filterCards(sampleCards, { rarity: 'Rare' }))).toEqual(['ASH-7', 'LAW-1']);
  });

  it('searches name and subtitle case-insensitively, ignoring surrounding spaces', () => {
    expect(ids(filterCards(sampleCards, { search: '  cad BANE ' }))).toEqual(['LAW-32']);
    expect(ids(filterCards(sampleCards, { search: 'spectre' }))).toEqual(['ASH-7']);
  });

  it('combines filters with AND and returns nothing when none match', () => {
    expect(ids(filterCards(sampleCards, { set: 'LAW', rarity: 'Rare', search: 'saw' }))).toEqual(['LAW-1']);
    expect(filterCards(sampleCards, { set: 'ASH', search: 'cad' })).toHaveLength(0);
  });

  it('does not mutate the input', () => {
    const copy = [...sampleCards];
    filterCards(sampleCards, { set: 'LAW' });
    expect(sampleCards).toEqual(copy);
  });
});

describe('sortCards', () => {
  it('sorts by set order then number by default', () => {
    expect(ids(sortCards(sampleCards))).toEqual(['LAW-1', 'LAW-32', 'ASH-7', 'HMW-3']);
  });

  it('sorts by name when requested', () => {
    expect(ids(sortCards(sampleCards, 'name'))).toEqual(['LAW-32', 'HMW-3', 'LAW-1', 'ASH-7']);
  });

  it('does not mutate the input', () => {
    const copy = [...sampleCards];
    sortCards(sampleCards);
    expect(sampleCards).toEqual(copy);
  });
});
