// Fetches the base Rare/Legendary catalog from the official SWU card API and writes
// supabase/seed/cards.json and supabase/seed.sql. Run: npm run seed:cards
// Read-only GET requests, one per set (plus extra pages only if a set exceeds the page size).
import { mkdirSync, writeFileSync } from 'node:fs';
import { SET_CODES } from '../src/lib/types.ts';
import { buildSeedSql, summarizeCatalog, transformCards, type RawPage } from './transform.ts';

const API = 'https://admin.starwarsunlimited.com/api/card-list';
const PAGE_SIZE = 250;
// The API rejects requests without a browser-like User-Agent.
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function url(setCode: string, page: number): string {
  const q = new URLSearchParams({
    locale: 'en',
    'filters[expansion][code][$eq]': setCode,
    'filters[rarity][name][$in][0]': 'Rare',
    'filters[rarity][name][$in][1]': 'Legendary',
    'filters[variantTypes][name][$eq]': 'Standard',
    'pagination[pageSize]': String(PAGE_SIZE),
    'pagination[page]': String(page),
  });
  return `${API}?${q}`;
}

async function fetchPage(setCode: string, page: number): Promise<RawPage & { meta: { pagination: { pageCount: number } } }> {
  const res = await fetch(url(setCode, page), { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`${setCode} page ${page}: HTTP ${res.status}`);
  return (await res.json()) as RawPage & { meta: { pagination: { pageCount: number } } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pages: RawPage[] = [];
for (const setCode of SET_CODES) {
  let page = 1;
  let pageCount = 1;
  do {
    const body = await fetchPage(setCode, page);
    pages.push(body);
    pageCount = body.meta.pagination.pageCount;
    page += 1;
    await sleep(500);
  } while (page <= pageCount);
}

const cards = transformCards({ data: pages.flatMap((p) => p.data) });
const report = summarizeCatalog(cards);

mkdirSync('supabase/seed', { recursive: true });
writeFileSync('supabase/seed/cards.json', JSON.stringify(cards, null, 2) + '\n');
writeFileSync('supabase/seed.sql', buildSeedSql(cards));

console.table(
  SET_CODES.map((set) => ({ set, Rare: report.counts[set].Rare, Legendary: report.counts[set].Legendary })),
);
console.log(`Total base R/L cards: ${cards.length}`);
if (report.anomalies.length > 0) {
  console.warn('Anomalies:\n- ' + report.anomalies.join('\n- '));
  process.exitCode = 1;
}
