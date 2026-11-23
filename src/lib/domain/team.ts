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
    const member = (entry.byMember[row.userId] ??= { displayName: row.displayName, qty: 0 });
    member.qty += row.qty;
  }
  return [...totals.values()];
}

export type MemberSummary = { userId: string; displayName: string; copies: number; distinctCards: number };

/** Per-member totals grouped by user id, sorted by display name (then user id for ties). */
export function summarizeMembers(rows: readonly TeamRow[]): MemberSummary[] {
  const byUser = new Map<string, MemberSummary>();
  for (const row of rows) {
    const entry = byUser.get(row.userId) ?? { userId: row.userId, displayName: row.displayName, copies: 0, distinctCards: 0 };
    if (row.qty > 0) {
      entry.copies += row.qty;
      entry.distinctCards += 1;
    }
    byUser.set(row.userId, entry);
  }
  return [...byUser.values()].sort(
    (a, b) => a.displayName.localeCompare(b.displayName) || a.userId.localeCompare(b.userId),
  );
}
