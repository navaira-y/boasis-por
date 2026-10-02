import { describe, expect, it } from 'vitest';
import {
  actByDate,
  addDays,
  addMonths,
  compareDates,
  dayNumber,
  dayOfWeek,
  daysUntil,
  firstDayOfMonth,
  formatIsoDate,
  fromDayNumber,
  isBefore,
  isOnOrAfter,
  isWeekend,
  isWorkingDay,
  lastDayOfMonth,
  latestOnOrBefore,
  maxDateOf,
  minDate,
  monthDayInYear,
  nextAfter,
  parseIsoDate,
} from './calendar';

describe('day numbers', () => {
  it('round-trips every kind of date', () => {
    for (const date of [
      '2026-09-12',
      '2000-02-29',
      '2100-03-01',
      '1999-12-31',
      '2028-02-29',
      '0001-01-01',
    ]) {
      expect(fromDayNumber(dayNumber(date))).toBe(date);
    }
  });

  it('parses and formats', () => {
    expect(parseIsoDate('2026-09-12')).toEqual({ year: 2026, month: 9, day: 12 });
    expect(formatIsoDate({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
    expect(() => parseIsoDate('2027-02-29')).toThrow('not a calendar date');
    expect(() => parseIsoDate('12/09/2026')).toThrow('not a calendar date');
  });

  it('compares', () => {
    expect(compareDates('2026-09-12', '2026-09-13')).toBe(-1);
    expect(isBefore('2026-09-12', '2026-09-13')).toBe(true);
    expect(isOnOrAfter('2026-09-12', '2026-09-12')).toBe(true);
    expect(minDate(['2026-09-13', '2026-09-12'])).toBe('2026-09-12');
    expect(maxDateOf(['2026-09-13', '2026-09-12'])).toBe('2026-09-13');
    expect(minDate([])).toBeNull();
    expect(maxDateOf([])).toBeNull();
  });
});

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('handles 29 February', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2028-02-29', 365)).toBe('2029-02-28');
  });
});

describe('addMonths', () => {
  it('clamps to the end of the target month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('handles 29 February across years', () => {
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2028-02-29', 48)).toBe('2032-02-29');
    expect(addMonths('2027-11-30', 3)).toBe('2028-02-29');
  });

  it('moves backwards and across years', () => {
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-10-01', 3)).toBe('2027-01-01');
    expect(addMonths('2025-12-31', 9)).toBe('2026-09-30');
  });
});

describe('daysUntil', () => {
  it('is signed whole days', () => {
    expect(daysUntil('2026-09-30', '2026-09-12')).toBe(18);
    expect(daysUntil('2026-09-12', '2026-09-12')).toBe(0);
    expect(daysUntil('2026-09-10', '2026-09-12')).toBe(-2);
  });
});

describe('weekdays and the act-by date', () => {
  it('names the day of the week', () => {
    expect(dayOfWeek('2026-09-12')).toBe('saturday');
    expect(dayOfWeek('2026-09-13')).toBe('sunday');
    expect(dayOfWeek('2026-09-14')).toBe('monday');
    expect(dayOfWeek('2000-01-01')).toBe('saturday');
  });

  it('treats Saturday and Sunday as the weekend (spec 7.1)', () => {
    expect(isWeekend('2026-09-12')).toBe(true);
    expect(isWeekend('2026-09-13')).toBe(true);
    expect(isWeekend('2026-09-11')).toBe(false);
    expect(isWorkingDay('2026-09-11', [])).toBe(true);
    expect(isWorkingDay('2026-09-11', ['2026-09-11'])).toBe(false);
  });

  it('moves a weekend deadline to the last working day before it', () => {
    expect(actByDate('2026-09-13', [])).toBe('2026-09-11');
    expect(actByDate('2026-09-12', [])).toBe('2026-09-11');
    expect(actByDate('2026-09-11', [])).toBe('2026-09-11');
  });

  it('skips a published holiday, and a holiday next to a weekend', () => {
    expect(actByDate('2026-09-11', ['2026-09-11'])).toBe('2026-09-10');
    expect(actByDate('2026-09-14', ['2026-09-14'])).toBe('2026-09-11');
    expect(actByDate('2026-09-14', ['2026-09-14', '2026-09-11'])).toBe('2026-09-10');
  });
});

describe('month helpers', () => {
  it('finds month ends and starts', () => {
    expect(lastDayOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02-10')).toBe('2028-02-29');
    expect(firstDayOfMonth('2026-09-12')).toBe('2026-09-01');
  });

  it('places a month-and-day in a year, clamped', () => {
    expect(monthDayInYear('12-31', 2026)).toBe('2026-12-31');
    expect(monthDayInYear('02-29', 2027)).toBe('2027-02-28');
    expect(monthDayInYear('02-29', 2028)).toBe('2028-02-29');
    expect(() => monthDayInYear('13-01', 2026)).toThrow('not a month and day');
  });

  it('finds the latest occurrence on or before and the next after', () => {
    expect(latestOnOrBefore('12-31', '2026-09-12')).toBe('2025-12-31');
    expect(latestOnOrBefore('12-31', '2026-12-31')).toBe('2026-12-31');
    expect(latestOnOrBefore('06-30', '2026-09-12')).toBe('2026-06-30');
    expect(nextAfter('12-31', '2026-12-31')).toBe('2027-12-31');
    expect(nextAfter('12-31', '2026-09-12')).toBe('2026-12-31');
  });
});
