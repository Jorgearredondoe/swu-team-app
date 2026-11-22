import type { Card, TeamCardTotal, TeamRow } from '../types.ts';

/** One total per catalog card (catalog order); cards nobody owns total 0. */
export function aggregateTeam(rows: readonly TeamRow[], cards: readonly Card[]): TeamCardTotal[] {
  const totals = new Map<string, TeamCardTotal>(
    cards.map((c) => [c.id, { cardId: c.id, total: 0, byMember: {} }]),
  );
  for (const row of rows) {
    const entry = totals.get(row.cardId);
    if (!entry || row.qty <= 0) continue;
    entry.total += row.qty;
    entry.byMember[row.displayName] = (entry.byMember[row.displayName] ?? 0) + row.qty;
  }
  return [...totals.values()];
}

export type MemberSummary = { displayName: string; copies: number; distinctCards: number };

/** Per-member totals, sorted by name. */
export function summarizeMembers(rows: readonly TeamRow[]): MemberSummary[] {
  const byName = new Map<string, MemberSummary>();
  for (const row of rows) {
    const entry = byName.get(row.displayName) ?? { displayName: row.displayName, copies: 0, distinctCards: 0 };
    if (row.qty > 0) {
      entry.copies += row.qty;
      entry.distinctCards += 1;
    }
    byName.set(row.displayName, entry);
  }
  return [...byName.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
