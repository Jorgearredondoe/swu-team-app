import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages, PAGE_SIZE } from './paging.ts';
import { fetchCards } from './cardsRepo.ts';
import { fetchMyStock, saveStockChanges } from './stockRepo.ts';
import { fetchTeamRows } from './teamRepo.ts';

type Result = { data: unknown[] | null; error: { message: string } | null };

/** Chainable stand-in for the PostgREST builder: records calls, resolves pages by range. */
function fakeClient(pagesByTable: Record<string, unknown[][]>, upsertResult: { error: { message: string } | null } = { error: null }) {
  const calls: { table: string; ranges: [number, number][]; upserts: { rows: unknown; opts: unknown }[]; filters: [string, unknown][]; signals: AbortSignal[] } = {
    table: '',
    filters: [],
    ranges: [],
    upserts: [],
    signals: [],
  };
  const served: Record<string, number> = {};
  const client = {
    from(table: string) {
      calls.table = table;
      const builder = {
        select: () => builder,
        eq(column: string, value: unknown) {
          calls.filters.push([column, value]);
          return builder;
        },
        order: () => builder,
        range(from: number, to: number): Promise<Result> {
          calls.ranges.push([from, to]);
          const page = pagesByTable[table]?.[served[table] ?? 0] ?? [];
          served[table] = (served[table] ?? 0) + 1;
          return Promise.resolve({ data: page, error: null });
        },
        upsert(rows: unknown, opts: unknown) {
          calls.upserts.push({ rows, opts });
          return Object.assign(Promise.resolve(upsertResult), {
            abortSignal(signal: AbortSignal) {
              calls.signals.push(signal);
              return this;
            },
          });
        },
      };
      return builder;
    },
  };
  return { client: client as never, calls };
}

describe('fetchAllPages', () => {
  it('keeps requesting pages until one is shorter than the page size', async () => {
    const full = Array.from({ length: PAGE_SIZE }, (_, i) => i);
    const pages = [full, full, [1, 2, 3]];
    const request = vi.fn(async (_from: number, _to: number) => pages.shift() ?? []);
    const all = await fetchAllPages(request);
    expect(all).toHaveLength(PAGE_SIZE * 2 + 3);
    expect(request.mock.calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
      [PAGE_SIZE * 2, PAGE_SIZE * 3 - 1],
    ]);
  });

  it('stops after a single short page', async () => {
    const request = vi.fn(async () => ['a']);
    expect(await fetchAllPages(request)).toEqual(['a']);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('cardsRepo', () => {
  it('maps snake_case rows to Card', async () => {
    const { client, calls } = fakeClient({
      cards: [[{ id: 'LAW-1', set_code: 'LAW', card_number: 1, name: 'Saw Gerrera', subtitle: null, rarity: 'Rare', card_type: 'Leader', image_url: 'https://x//a.png' }]],
    });
    expect(await fetchCards(client)).toEqual([
      { id: 'LAW-1', setCode: 'LAW', number: 1, name: 'Saw Gerrera', subtitle: null, rarity: 'Rare', type: 'Leader', imageUrl: 'https://x//a.png' },
    ]);
    expect(calls.table).toBe('cards');
  });

  it('throws when the query fails', async () => {
    const client = {
      from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: null, error: { message: 'denied' } }) }) }) }),
    } as never;
    await expect(fetchCards(client)).rejects.toThrow('denied');
  });
});

describe('stockRepo', () => {
  it('returns own stock as a cardId -> qty record', async () => {
    const { client, calls } = fakeClient({
      stock: [[{ card_id: 'LAW-1', qty: 2 }, { card_id: 'ASH-7', qty: 0 }]],
    });
    expect(await fetchMyStock(client)).toEqual({ 'LAW-1': 2, 'ASH-7': 0 });
    expect(calls.table).toBe('stock');
  });

  it('filters by user id when given', async () => {
    const { client, calls } = fakeClient({ stock: [[{ card_id: 'LAW-1', qty: 1 }]] });
    await fetchMyStock(client, 'user-9');
    expect(calls.filters).toEqual([['user_id', 'user-9']]);
  });

  it('upserts one batch keyed on user_id,card_id', async () => {
    const { client, calls } = fakeClient({});
    await saveStockChanges(client, 'user-1', [
      { cardId: 'LAW-1', qty: 3 },
      { cardId: 'ASH-7', qty: 0 },
    ]);
    expect(calls.upserts).toEqual([
      {
        rows: [
          { user_id: 'user-1', card_id: 'LAW-1', qty: 3 },
          { user_id: 'user-1', card_id: 'ASH-7', qty: 0 },
        ],
        opts: { onConflict: 'user_id,card_id' },
      },
    ]);
  });

  it('attaches the abort signal to the upsert request when given', async () => {
    const { client, calls } = fakeClient({});
    const controller = new AbortController();
    await saveStockChanges(client, 'u', [{ cardId: 'LAW-1', qty: 1 }], controller.signal);
    expect(calls.signals).toEqual([controller.signal]);
  });

  it('rejects when the upsert fails so the queue can roll back', async () => {
    const { client } = fakeClient({}, { error: { message: 'rls' } });
    await expect(saveStockChanges(client, 'u', [{ cardId: 'LAW-1', qty: 1 }])).rejects.toThrow('rls');
  });

  it('does nothing for an empty batch', async () => {
    const { client, calls } = fakeClient({});
    await saveStockChanges(client, 'u', []);
    expect(calls.upserts).toHaveLength(0);
  });
});

describe('teamRepo', () => {
  it('maps team_stock rows and pages past the 1000 row API limit', async () => {
    const row = (i: number) => ({ card_id: `LAW-${i}`, user_id: 'u1', display_name: 'Ana', qty: 1 });
    const page1 = Array.from({ length: PAGE_SIZE }, (_, i) => row(i));
    const page2 = [row(PAGE_SIZE)];
    const { client, calls } = fakeClient({ team_stock: [page1, page2] });
    const rows = await fetchTeamRows(client);
    expect(rows).toHaveLength(PAGE_SIZE + 1);
    expect(rows[0]).toEqual({ cardId: 'LAW-0', userId: 'u1', displayName: 'Ana', qty: 1 });
    expect(calls.ranges).toHaveLength(2);
  });
});
