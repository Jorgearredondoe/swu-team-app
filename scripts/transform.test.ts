import { describe, expect, it } from 'vitest';
import fixture from './fixtures/law-sample.json';
import { buildSeedSql, summarizeCatalog, transformCards } from './transform.ts';

type RawPage = Parameters<typeof transformCards>[0];
const raw = fixture as unknown as RawPage;

describe('transformCards', () => {
  it('keeps only base (Standard) R/L cards and drops every variant', () => {
    const cards = transformCards(raw);
    // fixture: 4 base cards + 2 Hyperspace + 1 Showcase variants
    expect(fixture.data).toHaveLength(7);
    expect(cards.map((c) => c.id)).toEqual(['LAW-1', 'LAW-19', 'LAW-32', 'LAW-85']);
  });

  it('maps API fields to the Card shape with id SET-number', () => {
    const [saw] = transformCards(raw);
    expect(saw).toEqual({
      id: 'LAW-1',
      setCode: 'LAW',
      number: 1,
      name: 'Saw Gerrera',
      subtitle: 'Bring Down the Empire',
      rarity: 'Rare',
      type: 'Leader',
      imageUrl: 'https://cdn.starwarsunlimited.com//card_07010001_EN_Saw_Gerrera_Leader_0c35c7027d.png',
    });
  });

  it('includes leaders and bases, not only units', () => {
    const types = transformCards(raw).map((c) => c.type);
    expect(types).toEqual(expect.arrayContaining(['Leader', 'Base']));
  });

  it('excludes non R/L rarities and sets outside the catalog', () => {
    const base = raw.data[0];
    const common = structuredClone(base);
    common.attributes.rarity.data!.attributes.name = 'Common';
    const otherSet = structuredClone(base);
    otherSet.attributes.expansion.data!.attributes.code = 'SOR';
    expect(transformCards({ ...raw, data: [common, otherSet] })).toEqual([]);
  });

  it('deduplicates repeated rows by id and sorts by set then number', () => {
    const [a, b] = raw.data;
    const ash = structuredClone(a);
    ash.attributes.expansion.data!.attributes.code = 'ASH';
    const cards = transformCards({ ...raw, data: [b, a, a, ash] });
    expect(cards.map((c) => c.id)).toEqual(['LAW-1', 'LAW-32', 'ASH-1']);
  });

  it('falls back to the full-size art url when no card format exists', () => {
    const base = structuredClone(raw.data[0]);
    delete (base.attributes.artFront.data!.attributes.formats as { card?: unknown }).card;
    const [card] = transformCards({ ...raw, data: [base] });
    expect(card.imageUrl).toBe('https://cdn.starwarsunlimited.com//07010001_EN_Saw_Gerrera_Leader_0c35c7027d.png');
  });

  it('reports a card without any image url as having an empty imageUrl for validation', () => {
    const base = structuredClone(raw.data[0]);
    base.attributes.artFront = { data: null };
    const [card] = transformCards({ ...raw, data: [base] });
    expect(card.imageUrl).toBe('');
  });
});

describe('buildSeedSql', () => {
  const cards = transformCards(raw);

  it('emits one idempotent upsert keyed by (set_code, card_number)', () => {
    const sql = buildSeedSql(cards);
    expect(sql).toContain('insert into public.cards');
    expect(sql).toContain('on conflict (set_code, card_number) do update');
    expect(sql).toContain("('LAW-1', 'LAW', 1, 'Saw Gerrera', 'Bring Down the Empire', 'Rare', 'Leader',");
    expect(sql.match(/^\('/gm)).toHaveLength(4);
  });

  it('escapes single quotes and renders null subtitles', () => {
    const sql = buildSeedSql([
      { ...cards[0], id: 'LAW-9', number: 9, name: "Cad's Blaster", subtitle: null },
    ]);
    expect(sql).toContain("'Cad''s Blaster', null,");
  });
});

describe('summarizeCatalog', () => {
  const cards = transformCards(raw);

  it('counts Rare and Legendary per set, listing sets with no cards as anomalies', () => {
    const report = summarizeCatalog(cards);
    expect(report.counts.LAW).toEqual({ Rare: 3, Legendary: 1 });
    expect(report.counts.ASH).toEqual({ Rare: 0, Legendary: 0 });
    expect(report.anomalies).toEqual(['No cards for set ASH', 'No cards for set HMW', 'No cards for set IC27']);
  });

  it('flags cards without an image url', () => {
    const broken = [{ ...cards[0], imageUrl: '' }, ...cards.slice(1)];
    expect(summarizeCatalog(broken).anomalies).toContain('Card LAW-1 has no image url');
  });
});
