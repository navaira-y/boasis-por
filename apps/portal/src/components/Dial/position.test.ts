import { describe, expect, it } from 'vitest';
import {
  angleGap,
  daysInMonth,
  oneYearOn,
  parseDate,
  placeInWindow,
  positionFor,
} from './position';

describe('positionFor', () => {
  it('puts the first of January at the top and the first of July at the bottom', () => {
    expect(positionFor('2026-01-01')).toBe(-90);
    expect(positionFor('2026-07-01')).toBe(90);
    expect(positionFor('2026-04-01')).toBe(0);
    expect(positionFor('2026-10-01')).toBe(180);
  });

  it('spreads the days of a month across its twelfth', () => {
    const first = positionFor('2026-03-01');
    const sixteenth = positionFor('2026-03-16');
    const last = positionFor('2026-03-31');
    const nextMonth = positionFor('2026-04-01');
    expect(first).not.toBeNull();
    expect(sixteenth).not.toBeNull();
    expect(last).not.toBeNull();
    expect(nextMonth).not.toBeNull();
    if (first !== null && sixteenth !== null && last !== null && nextMonth !== null) {
      expect(sixteenth).toBeCloseTo(first + 15 * (30 / 31), 6);
      expect(last).toBeLessThan(nextMonth);
      expect(nextMonth - last).toBeCloseTo(30 / 31, 6);
    }
  });

  it('handles 29 February in a leap year and rejects it otherwise', () => {
    const leap = positionFor('2024-02-29');
    const march = positionFor('2024-03-01');
    expect(leap).not.toBeNull();
    expect(march).not.toBeNull();
    if (leap !== null && march !== null) {
      expect(leap).toBeCloseTo(-90 + 30 + (28 / 29) * 30, 6);
      expect(leap).toBeLessThan(march);
    }
    expect(positionFor('2025-02-29')).toBeNull();
    expect(positionFor('2100-02-29')).toBeNull();
    expect(positionFor('2000-02-29')).not.toBeNull();
  });

  it('puts month ends just before the next tick', () => {
    for (const [date, next] of [
      ['2026-01-31', '2026-02-01'],
      ['2026-02-28', '2026-03-01'],
      ['2026-04-30', '2026-05-01'],
      ['2026-12-31', '2027-01-01'],
    ] as const) {
      const end = positionFor(date);
      const following = positionFor(next);
      expect(end).not.toBeNull();
      expect(following).not.toBeNull();
      if (end !== null && following !== null) {
        const gap = angleGap(end, following);
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThan(1.1);
      }
    }
  });

  it('returns null for anything that is not a calendar date', () => {
    expect(positionFor('2026-13-01')).toBeNull();
    expect(positionFor('2026-04-31')).toBeNull();
    expect(positionFor('2026-4-1')).toBeNull();
    expect(positionFor('')).toBeNull();
    expect(positionFor('today')).toBeNull();
  });
});

describe('daysInMonth and parseDate', () => {
  it('knows the month lengths', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2026, 11)).toBe(30);
  });

  it('parses without a Date', () => {
    expect(parseDate('2026-09-12')).toEqual({ year: 2026, month: 9, day: 12 });
    expect(parseDate('2026-09-31')).toBeNull();
  });
});

describe('placeInWindow', () => {
  const today = '2026-09-12';

  it('shows today and the next twelve months, nothing before, nothing at or past a year', () => {
    expect(placeInWindow('2026-09-12', today)).toBe('shown');
    expect(placeInWindow('2026-09-11', today)).toBe('past');
    expect(placeInWindow('2027-09-11', today)).toBe('shown');
    expect(placeInWindow('2027-09-12', today)).toBe('beyond');
    expect(placeInWindow('2028-01-01', today)).toBe('beyond');
    expect(placeInWindow('2025-09-12', today)).toBe('past');
  });

  it('never folds a second year onto the face', () => {
    // Same face position, different years: only one of them is drawn.
    expect(placeInWindow('2027-03-01', today)).toBe('shown');
    expect(placeInWindow('2028-03-01', today)).toBe('beyond');
    expect(placeInWindow('2026-03-01', today)).toBe('past');
  });

  it('rolls the window from a 29 February today', () => {
    expect(oneYearOn('2024-02-29')).toBe('2025-02-29');
    expect(placeInWindow('2025-02-28', '2024-02-29')).toBe('shown');
    expect(placeInWindow('2025-03-01', '2024-02-29')).toBe('beyond');
  });
});
