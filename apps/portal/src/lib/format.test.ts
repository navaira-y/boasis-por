import { describe, expect, it } from 'vitest';
import { formatLong, formatMonth, formatShort, monthShort, plural } from './format';

describe('format', () => {
  it("writes lite's short, long and month forms", () => {
    expect(formatShort('2026-10-03')).toBe('3 Oct');
    expect(formatLong('2026-10-03')).toBe('3 Oct 2026');
    expect(formatMonth('2026-10-03')).toBe('October 2026');
  });

  it('never shifts the day whatever the host zone: the last day of a month stays that day', () => {
    expect(formatShort('2026-12-31')).toBe('31 Dec');
    expect(formatShort('2026-01-01')).toBe('1 Jan');
  });

  it('writes a dash for nothing', () => {
    expect(formatShort(null)).toBe('not set');
    expect(formatLong(undefined)).toBe('not set');
    expect(formatMonth('not a date')).toBe('not set');
  });

  it('names the months of the dial in upper case', () => {
    expect(monthShort(0)).toBe('JAN');
    expect(monthShort(11)).toBe('DEC');
  });

  it('picks the plural form by count', () => {
    expect(plural(1, '{count} day', '{count} days')).toBe('1 day');
    expect(plural(3, '{count} day', '{count} days')).toBe('3 days');
    expect(plural(0, '{count} day', '{count} days')).toBe('0 days');
  });
});
