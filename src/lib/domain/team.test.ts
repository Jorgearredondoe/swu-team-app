import { describe, expect, it } from 'vitest';
import { sampleCards } from './fixtures.ts';
import { aggregateTeam } from './team.ts';

const rows = [
  { cardId: 'LAW-1', userId: 'u-a', displayName: 'Alice', qty: 2 },
  { cardId: 'LAW-1', userId: 'u-b', displayName: 'Bea', qty: 1 },
  { cardId: 'LAW-32', userId: 'u-b', displayName: 'Bea', qty: 3 },
  { cardId: 'ASH-7', userId: 'u-a', displayName: 'Alice', qty: 0 },
];

describe('aggregateTeam', () => {
  it('sums quantities per card with a per-member breakdown', () => {
    const totals = aggregateTeam(rows, sampleCards);
    expect(totals.find((t) => t.cardId === 'LAW-1')).toEqual({ cardId: 'LAW-1', total: 3, byMember: { Alice: 2, Bea: 1 } });
    expect(totals.find((t) => t.cardId === 'LAW-32')).toEqual({ cardId: 'LAW-32', total: 3, byMember: { Bea: 3 } });
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

  it('ignores stock rows for cards missing from the catalog', () => {
    const totals = aggregateTeam([{ cardId: 'XXX-9', userId: 'u-a', displayName: 'Alice', qty: 4 }], sampleCards);
    expect(totals.map((t) => t.cardId)).not.toContain('XXX-9');
  });
});
