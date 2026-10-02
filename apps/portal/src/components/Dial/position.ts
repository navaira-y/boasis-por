// Display geometry for the dial. Parses YYYY-MM-DD strings with integer arithmetic only; no
// Date object anywhere. This decides where a mark is drawn, never what a date means: days
// left, states and act-by dates come from packages/rules.

export interface CalendarParts {
  readonly year: number;
  readonly month: number; // 1 to 12
  readonly day: number; // 1 to 31
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

// Null for anything that is not a real calendar date, so a bad string is skipped, not drawn.
export function parseDate(value: string): CalendarParts | null {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

// The angle of a date on the face, in degrees: January the first at the top (-90), the year
// running clockwise, each month one twelfth, each day its share of the month. The first of a
// month sits exactly on the month tick; the last day sits just before the next tick. A date
// twelve months from today lands where today does, which is why the window below keeps it off.
export function positionFor(date: string): number | null {
  const parts = parseDate(date);
  if (parts === null) {
    return null;
  }
  const monthFraction = (parts.day - 1) / daysInMonth(parts.year, parts.month);
  return ((parts.month - 1 + monthFraction) / 12) * 360 - 90;
}

// The same date one year on, as a string. 29 February becomes 29 February in a year that has
// no such day, which is fine for a string comparison: it still sorts after 28 February.
export function oneYearOn(today: string): string {
  const parts = parseDate(today);
  if (parts === null) {
    return today;
  }
  const year = String(parts.year + 1).padStart(4, '0');
  return `${year}${today.slice(4)}`;
}

export type WindowPlace = 'past' | 'shown' | 'beyond';

// Where a date sits against the twelve months from today: before today, inside the window,
// or twelve months or more out. Plain string order is calendar order for YYYY-MM-DD.
export function placeInWindow(date: string, today: string): WindowPlace {
  if (date < today) {
    return 'past';
  }
  if (date >= oneYearOn(today)) {
    return 'beyond';
  }
  return 'shown';
}

// Polar to cartesian on the face, angle in degrees from the top, clockwise.
export function pointAt(centre: number, radius: number, angle: number): { x: number; y: number } {
  const radians = (angle * Math.PI) / 180;
  return { x: centre + radius * Math.cos(radians), y: centre + radius * Math.sin(radians) };
}

// The smallest turn between two angles, 0 to 180.
export function angleGap(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}
