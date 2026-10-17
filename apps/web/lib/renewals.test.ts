import { describe, expect, it } from 'vitest';
import {
  addMonths,
  daysUntil,
  dueThresholds,
  freeYearEnd,
  periodEnded,
  uaeDay,
} from './renewals';

describe('addMonths', () => {
  it('keeps the day of month where it exists', () => {
    expect(addMonths(new Date('2026-10-16T00:00:00Z'), 1).toISOString()).toBe(
      '2026-11-16T00:00:00.000Z',
    );
  });

  it('clamps to the end of a shorter month instead of overflowing', () => {
    expect(addMonths(new Date('2026-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
    expect(addMonths(new Date('2028-01-31T00:00:00Z'), 1).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    );
  });
});

describe('the free year', () => {
  it('runs twelve months from the day it started', () => {
    expect(freeYearEnd(new Date('2026-10-16T09:30:00Z')).toISOString()).toBe(
      '2027-10-16T09:30:00.000Z',
    );
  });
});

describe('UAE day counting', () => {
  it('rolls over at midnight in Dubai, not midnight UTC', () => {
    // 20:30 UTC is already the next day in the UAE (UTC+4).
    const evening = new Date('2026-10-15T20:30:00Z');
    expect(uaeDay(new Date('2026-10-15T19:30:00Z')) + 1).toBe(uaeDay(evening));
  });

  it('counts whole days between dates', () => {
    const now = new Date('2026-10-16T06:00:00Z');
    expect(daysUntil(new Date('2026-11-15T06:00:00Z'), now)).toBe(30);
    expect(daysUntil(new Date('2026-10-17T06:00:00Z'), now)).toBe(1);
    expect(daysUntil(now, now)).toBe(0);
    expect(daysUntil(new Date('2026-10-15T06:00:00Z'), now)).toBe(-1);
  });
});

describe('reminder thresholds', () => {
  const now = new Date('2026-10-16T06:00:00Z');

  it('fires on the day it is exactly that many days out', () => {
    expect(dueThresholds(new Date('2026-11-15T06:00:00Z'), now)).toEqual([30]);
    expect(dueThresholds(new Date('2026-10-30T06:00:00Z'), now)).toEqual([14]);
    expect(dueThresholds(new Date('2026-10-23T06:00:00Z'), now)).toEqual([7]);
    expect(dueThresholds(new Date('2026-10-17T06:00:00Z'), now)).toEqual([1]);
  });

  it('stays quiet on other days', () => {
    expect(dueThresholds(new Date('2026-11-14T06:00:00Z'), now)).toEqual([]);
    expect(dueThresholds(new Date('2026-10-20T06:00:00Z'), now)).toEqual([]);
    expect(dueThresholds(new Date('2026-10-10T06:00:00Z'), now)).toEqual([]);
  });

  it('knows when the period is over', () => {
    expect(periodEnded(new Date('2026-10-15T06:00:00Z'), now)).toBe(true);
    expect(periodEnded(now, now)).toBe(true);
  });
});
