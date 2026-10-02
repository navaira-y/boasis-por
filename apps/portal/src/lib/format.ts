import type { IsoDate } from '@boasis/schema';

// Writing a date down is not calculating one. These turn a YYYY-MM-DD string into the words lite
// shows ("3 Oct", "3 Oct 2026", "October 2026") through Intl, pinned to UTC so the host's zone
// can never shift the day. No arithmetic here: that lives in packages/rules.
const LOCALE = 'en-AE';

const SHORT = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' });
const LONG = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const MONTH = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' });
const MONTH_SHORT = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' });

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A Date at midnight UTC on the calendar day, or null for anything that is not a date.
function utcDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return null;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

// A dash rather than an exception: Intl throws on null, and an exception in a render freezes the
// whole screen for a cell that only had to stay empty (lite's rule).
const DASH = 'not set';

export function formatShort(date: IsoDate | null | undefined): string {
  const value = date == null ? null : utcDate(date);
  return value === null ? DASH : SHORT.format(value);
}

export function formatLong(date: IsoDate | null | undefined): string {
  const value = date == null ? null : utcDate(date);
  return value === null ? DASH : LONG.format(value);
}

export function formatMonth(date: IsoDate | null | undefined): string {
  const value = date == null ? null : utcDate(date);
  return value === null ? DASH : MONTH.format(value);
}

// The month names on the dial, upper case, index 0 to 11.
export function monthShort(index: number): string {
  return MONTH_SHORT.format(new Date(Date.UTC(2026, index, 1))).toUpperCase();
}

// Lite's plural forms, in English only: one and other.
export function plural(count: number, one: string, other: string): string {
  return (count === 1 ? one : other).replace('{count}', String(count));
}
