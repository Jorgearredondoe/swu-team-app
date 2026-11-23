/** Quantities are integers >= 0; anything else is normalised (NaN and infinities become 0). */
export function clampQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function adjustQty(current: number, delta: number): number {
  return clampQty(current + delta);
}
