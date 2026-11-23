import { describe, expect, it } from 'vitest';

import { ageInDays, isStale, STALE_AFTER_DAYS } from '@/lib/stale.ts';

const DAY = 86_400_000;
const MEASURED = '2026-11-01T12:00:00.000Z';
const at = (days: number) => Date.parse(MEASURED) + days * DAY;

describe('the stale rule', () => {
  it('allows fourteen days', () => {
    expect(STALE_AFTER_DAYS).toBe(14);
  });

  it('is fresh at exactly fourteen days', () => {
    expect(isStale(MEASURED, at(14))).toBe(false);
  });

  it('is stale once older than fourteen days', () => {
    expect(isStale(MEASURED, at(14) + 1)).toBe(true);
  });

  it('is fresh the moment it is measured', () => {
    expect(isStale(MEASURED, at(0))).toBe(false);
  });
});

describe('ageInDays', () => {
  it('counts whole days, rounding down', () => {
    expect(ageInDays(MEASURED, at(21) + DAY / 2)).toBe(21);
  });
});
