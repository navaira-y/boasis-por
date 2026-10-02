import type { IsoDate, MonthDay } from '@boasis/schema';

// Every date in the product is a YYYY-MM-DD string in the Asia/Dubai calendar. This file turns
// those strings into integer day numbers and back. Integer arithmetic only: no Date object, so no
// host time zone, no daylight saving and no UTC conversion can shift a day.

export interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Days from the Julian epoch for a proleptic Gregorian calendar date.
function dayNumberOf(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

// The inverse of dayNumberOf (Richards' algorithm for the Gregorian calendar).
function partsOf(dayNumber: number): CalendarParts {
  const f =
    dayNumber + 1401 + Math.floor((Math.floor((4 * dayNumber + 274277) / 146097) * 3) / 4) - 38;
  const e = 4 * f + 3;
  const g = Math.floor((e % 1461) / 4);
  const h = 5 * g + 2;
  const day = Math.floor((h % 153) / 5) + 1;
  const month = ((Math.floor(h / 153) + 2) % 12) + 1;
  const year = Math.floor(e / 1461) - 4716 + Math.floor((14 - month) / 12);
  return { year, month, day };
}

export function parseIsoDate(value: IsoDate): CalendarParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`not a calendar date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new Error(`not a calendar date: ${value}`);
  }
  return { year, month, day };
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

export function formatIsoDate(parts: CalendarParts): IsoDate {
  return `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
}

// The integer day number of a date. Two dates compare as their day numbers.
export function dayNumber(date: IsoDate): number {
  const { year, month, day } = parseIsoDate(date);
  return dayNumberOf(year, month, day);
}

export function fromDayNumber(value: number): IsoDate {
  return formatIsoDate(partsOf(value));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(dayNumber(date) + days);
}

// Adds whole months and clamps to the end of the target month: 31 January plus one month is
// 28 February (29 in a leap year); 29 February plus twelve months is 28 February.
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return formatIsoDate({
    year: targetYear,
    month: targetMonth,
    day: Math.min(day, daysInMonth(targetYear, targetMonth)),
  });
}

// Whole calendar days from `today` to `date`. Positive when the date is ahead, zero on the day,
// negative once it has passed.
export function daysUntil(date: IsoDate, today: IsoDate): number {
  return dayNumber(date) - dayNumber(today);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return dayNumber(a) - dayNumber(b);
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return compareDates(a, b) < 0;
}

export function isOnOrAfter(a: IsoDate, b: IsoDate): boolean {
  return compareDates(a, b) >= 0;
}

export function minDate(dates: readonly IsoDate[]): IsoDate | null {
  let best: IsoDate | null = null;
  for (const date of dates) {
    if (best === null || isBefore(date, best)) {
      best = date;
    }
  }
  return best;
}

export function maxDateOf(dates: readonly IsoDate[]): IsoDate | null {
  let best: IsoDate | null = null;
  for (const date of dates) {
    if (best === null || isBefore(best, date)) {
      best = date;
    }
  }
  return best;
}

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

// The day of the week of a date. Day number 0 of this epoch is a Monday.
export function dayOfWeek(date: IsoDate): Weekday {
  const index = (((dayNumber(date) + 1) % 7) + 7) % 7;
  const name = WEEKDAYS[index];
  if (name === undefined) {
    throw new Error(`no weekday at index ${String(index)}`);
  }
  return name;
}

// Spec 7.1: the weekend is Saturday and Sunday.
export function isWeekend(date: IsoDate): boolean {
  const weekday = dayOfWeek(date);
  return weekday === 'saturday' || weekday === 'sunday';
}

export function isWorkingDay(date: IsoDate, holidays: readonly string[]): boolean {
  return !isWeekend(date) && !holidays.includes(date);
}

// Spec 7.1, last paragraph: a deadline that falls on a weekend or a published public holiday
// shows the last working day before it as the act-by date. A working day is its own act-by date.
export function actByDate(date: IsoDate, holidays: readonly string[]): IsoDate {
  let current = date;
  // Bounded so a holiday list that covers every day cannot loop forever.
  for (let step = 0; step < 366; step += 1) {
    if (isWorkingDay(current, holidays)) {
      return current;
    }
    current = addDays(current, -1);
  }
  throw new Error(`no working day in the year before ${date}`);
}

export function lastDayOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return formatIsoDate({ year, month, day: daysInMonth(year, month) });
}

export function firstDayOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return formatIsoDate({ year, month, day: 1 });
}

function parseMonthDay(value: MonthDay): { month: number; day: number } {
  const match = /^(\d{2})-(\d{2})$/.exec(value);
  if (match === null) {
    throw new Error(`not a month and day: ${value}`);
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`not a month and day: ${value}`);
  }
  return { month, day };
}

// The date a recurring month-and-day falls on in a given year, clamped to the month's end so a
// year end of 02-29 is 28 February in a common year.
export function monthDayInYear(monthDay: MonthDay, year: number): IsoDate {
  const { month, day } = parseMonthDay(monthDay);
  return formatIsoDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

// The most recent occurrence of a month-and-day on or before a date.
export function latestOnOrBefore(monthDay: MonthDay, date: IsoDate): IsoDate {
  const { year } = parseIsoDate(date);
  const thisYear = monthDayInYear(monthDay, year);
  return isOnOrAfter(date, thisYear) ? thisYear : monthDayInYear(monthDay, year - 1);
}

// The first occurrence of a month-and-day strictly after a date.
export function nextAfter(monthDay: MonthDay, date: IsoDate): IsoDate {
  const { year } = parseIsoDate(date);
  const thisYear = monthDayInYear(monthDay, year);
  return isBefore(date, thisYear) ? thisYear : monthDayInYear(monthDay, year + 1);
}
