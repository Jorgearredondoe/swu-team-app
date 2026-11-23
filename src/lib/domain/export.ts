import type { Card, ExportV1, TeamRow } from '../types.ts';

export function buildExport(cards: readonly Card[], stock: readonly TeamRow[], now: Date): ExportV1 {
  return {
    version: 1,
    exportedAt: now.toISOString(),
    cards: [...cards],
    stock: stock.filter((s) => s.qty > 0),
  };
}

export function serializeExport(data: ExportV1): string {
  return JSON.stringify(data, null, 2);
}

export function exportFileName(now: Date): string {
  return `swu-stock-${now.toISOString().slice(0, 10)}.json`;
}
