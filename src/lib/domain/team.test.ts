import { describe, expect, it } from 'vitest';
import { sampleCards } from './fixtures.ts';
import { aggregateTeam, summarizeMembers } from './team.ts';

const rows = [
  { cardId: 'LAW-1', userId: 'u-a', displayName: 'Alice', qty: 2 },
  { cardId: 'LAW-1', userId: 'u-b', displayName: 'Bea', qty: 1 },
  { cardId: 'LAW-32', userId: 'u-b', displayName: 'Bea', qty: 3 },
  { cardId: 'ASH-7', userId: 'u-a', displayName: 'Alice', qty: 0 },
];

describe('aggregateTeam', () => {
  it('sums quantities per card with a per-member breakdown', () => {
    const totals = aggregateTeam(rows, sampleCards);
    expect(totals.find((t) => t.cardId === 'LAW-1')).toEqual({
      cardId: 'LAW-1',
      total: 3,
      byMember: { 'u-a': { displayName: 'Alice', qty: 2 }, 'u-b': { displayName: 'Bea', qty: 1 } },
    });
    expect(totals.find((t) => t.cardId === 'LAW-32')).toEqual({ cardId: 'LAW-32', total: 3, byMember: { 'u-b': { displayName: 'Bea', qty: 3 } } });
  });

  it('reports 0 for cards nobody owns, including explicit qty 0 rows', () => {
    const totals = aggregateTeam(rows, sampleCards);
    expect(totals.find((t) => t.cardId === 'HMW-3')).toEqual({ cardId: 'HMW-3', total: 0, byMember: {} });
    expect(totals.find((t) => t.cardId === 'ASH-7')?.total).toBe(0);
  });

  it('returns one entry per catalog card, in catalog order', () => {
    expect(aggregateTeam(rows, sampleCards).map((t) => t.cardId)).toEqual(['ASH-7', 'LAW-32', 'LAW-1', 'HMW-3']);
  });

  it('with no stock rows every total is 0', () => {
    const totals = aggregateTeam([], sampleCards);
    expect(totals).toHaveLength(4);
    expect(totals.every((t) => t.total === 0)).toBe(true);
  });

  it('keeps members with the same display name apart (grouped by user id)', () => {
    const twins = [
      { cardId: 'LAW-1', userId: 'u-1', displayName: 'Sam', qty: 2 },
      { cardId: 'LAW-1', userId: 'u-2', displayName: 'Sam', qty: 1 },
    ];
    expect(aggregateTeam(twins, sampleCards).find((t) => t.cardId === 'LAW-1')?.byMember).toEqual({
      'u-1': { displayName: 'Sam', qty: 2 },
      'u-2': { displayName: 'Sam', qty: 1 },
    });
  });

  it('ignores stock rows for cards missing from the catalog', () => {
    const totals = aggregateTeam([{ cardId: 'XXX-9', userId: 'u-a', displayName: 'Alice', qty: 4 }], sampleCards);
    expect(totals.map((t) => t.cardId)).not.toContain('XXX-9');
  });
});

describe('summarizeMembers', () => {
  it('counts copies and distinct cards per member, ignoring qty 0 rows', () => {
    expect(summarizeMembers(rows)).toEqual([
      { userId: 'u-a', displayName: 'Alice', copies: 2, distinctCards: 1 },
      { userId: 'u-b', displayName: 'Bea', copies: 4, distinctCards: 2 },
    ]);
  });

  it('lists a member with only zero rows as 0 copies', () => {
    expect(summarizeMembers([{ cardId: 'ASH-7', userId: 'u-c', displayName: 'Cy', qty: 0 }])).toEqual([
      { userId: 'u-c', displayName: 'Cy', copies: 0, distinctCards: 0 },
    ]);
  });

  it('summarizes members with duplicate display names separately', () => {
    expect(
      summarizeMembers([
        { cardId: 'LAW-1', userId: 'u-2', displayName: 'Sam', qty: 1 },
        { cardId: 'LAW-1', userId: 'u-1', displayName: 'Sam', qty: 2 },
        { cardId: 'ASH-7', userId: 'u-1', displayName: 'Sam', qty: 1 },
      ]),
    ).toEqual([
      { userId: 'u-1', displayName: 'Sam', copies: 3, distinctCards: 2 },
      { userId: 'u-2', displayName: 'Sam', copies: 1, distinctCards: 1 },
    ]);
  });

  it('returns an empty list when there is no stock at all', () => {
    expect(summarizeMembers([])).toEqual([]);
  });
});
