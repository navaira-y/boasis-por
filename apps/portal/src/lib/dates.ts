import { daysUntil, parseIsoDate } from '@boasis/rules';
import type { IsoDate } from '@boasis/schema';

// Writing a date down, as lite writes it in English (en-AE): "12 Sep" and "12 Sep 2026". No
// Date object and no arithmetic: the parts come from packages/rules.
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function monthName(month: number): string {
  return MONTHS[month - 1] ?? '';
}

export function formatShort(date: IsoDate | null): string {
  if (date === null) {
    return 'No date';
  }
  const { month, day } = parseIsoDate(date);
  return `${String(day)} ${monthName(month)}`;
}

export function formatLong(date: IsoDate | null): string {
  if (date === null) {
    return 'No date';
  }
  const { year, month, day } = parseIsoDate(date);
  return `${String(day)} ${monthName(month)} ${String(year)}`;
}

// Lite's units: "27 days", "1 day", "3 days late".
export function daysText(count: number): string {
  return count === 1 ? '1 day' : `${String(count)} days`;
}

export function daysLateText(count: number): string {
  return count === 1 ? '1 day late' : `${String(count)} days late`;
}

// "in 27 days" ahead of a date, "3 days late" past it.
export function daysLine(date: IsoDate, today: IsoDate): string {
  const days = daysUntil(date, today);
  return days < 0 ? daysLateText(-days) : `in ${daysText(days)}`;
}
