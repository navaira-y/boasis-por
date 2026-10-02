import { describe, expect, it } from 'vitest';
import { daysUntil } from './days-until';

describe('daysUntil', () => {
  it('counts whole days ahead', () => {
    expect(daysUntil('2026-09-30', '2026-09-12')).toBe(18);
  });

  it('is zero on the day and negative after it', () => {
    expect(daysUntil('2026-09-12', '2026-09-12')).toBe(0);
    expect(daysUntil('2026-09-10', '2026-09-12')).toBe(-2);
  });

  it('counts 29 February in a leap year', () => {
    expect(daysUntil('2028-03-01', '2028-02-28')).toBe(2);
    expect(daysUntil('2028-02-29', '2028-02-28')).toBe(1);
  });

  it('skips 29 February in a common year and in 2100', () => {
    expect(daysUntil('2027-03-01', '2027-02-28')).toBe(1);
    expect(daysUntil('2100-03-01', '2100-02-28')).toBe(1);
  });

  it('spans a year end', () => {
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
    expect(daysUntil('2027-09-12', '2026-09-12')).toBe(365);
    expect(daysUntil('2028-09-12', '2027-09-12')).toBe(366);
  });

  it('rejects an impossible date', () => {
    expect(() => daysUntil('2027-02-29', '2027-01-01')).toThrow('not a calendar date');
    expect(() => daysUntil('2026-13-01', '2026-01-01')).toThrow('not a calendar date');
  });
});
