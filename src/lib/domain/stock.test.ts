import { describe, expect, it } from 'vitest';
import { adjustQty, clampQty } from './stock.ts';

describe('clampQty', () => {
  it('keeps valid non-negative integers', () => {
    expect(clampQty(0)).toBe(0);
    expect(clampQty(7)).toBe(7);
  });

  it('raises negatives to 0', () => {
    expect(clampQty(-1)).toBe(0);
    expect(clampQty(-250)).toBe(0);
  });

  it('truncates fractions to an integer', () => {
    expect(clampQty(1.5)).toBe(1);
    expect(clampQty(2.99)).toBe(2);
  });

  it('maps NaN and infinities to 0', () => {
    expect(clampQty(Number.NaN)).toBe(0);
    expect(clampQty(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('adjustQty', () => {
  it('adds the delta', () => {
    expect(adjustQty(2, 1)).toBe(3);
    expect(adjustQty(5, -2)).toBe(3);
  });

  it('never goes below 0', () => {
    expect(adjustQty(0, -1)).toBe(0);
    expect(adjustQty(1, -5)).toBe(0);
  });
});
