import { describe, expect, it } from 'vitest';
import { buildExport, exportFileName, serializeExport } from './export.ts';
import { sampleCards } from './fixtures.ts';

const now = new Date('2026-11-22T18:30:00.000Z');
const stock = [
  { cardId: 'LAW-1', userId: 'u-a', displayName: 'Alice', qty: 2 },
  { cardId: 'LAW-32', userId: 'u-a', displayName: 'Alice', qty: 0 },
  { cardId: 'HMW-3', userId: 'u-b', displayName: 'Bea', qty: 1 },
];

describe('buildExport', () => {
  it('includes version, timestamp, cards and only owned (qty > 0) stock rows', () => {
    const out = buildExport(sampleCards, stock, now);
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe('2026-11-22T18:30:00.000Z');
    expect(out.cards).toHaveLength(4);
    expect(out.stock).toEqual([
      { cardId: 'LAW-1', userId: 'u-a', displayName: 'Alice', qty: 2 },
      { cardId: 'HMW-3', userId: 'u-b', displayName: 'Bea', qty: 1 },
    ]);
  });

  it('produces an empty stock list for a member with no stock', () => {
    const out = buildExport(sampleCards, [], now);
    expect(out.stock).toEqual([]);
    expect(out.cards).toHaveLength(4);
  });
});

describe('serializeExport', () => {
  it('is valid JSON that round-trips the quantities', () => {
    const parsed = JSON.parse(serializeExport(buildExport(sampleCards, stock, now)));
    expect(parsed.stock.map((s: { cardId: string; qty: number }) => [s.cardId, s.qty])).toEqual([
      ['LAW-1', 2],
      ['HMW-3', 1],
    ]);
  });

  it('is valid JSON for an empty export', () => {
    const parsed = JSON.parse(serializeExport(buildExport([], [], now)));
    expect(parsed).toEqual({ version: 1, exportedAt: '2026-11-22T18:30:00.000Z', cards: [], stock: [] });
  });
});

describe('exportFileName', () => {
  it('uses the UTC date as swu-stock-YYYY-MM-DD.json', () => {
    expect(exportFileName(now)).toBe('swu-stock-2026-11-22.json');
    expect(exportFileName(new Date('2027-01-05T00:00:00Z'))).toBe('swu-stock-2027-01-05.json');
  });
});
