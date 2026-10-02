import type { IsoDate, MonthDay } from '@boasis/schema';
import {
  addMonths,
  firstDayOfMonth,
  isBefore,
  isOnOrAfter,
  lastDayOfMonth,
  latestOnOrBefore,
  nextAfter,
} from './calendar';

// The period arithmetic behind the recurring requirements. A card is computed for the current
// cycle: the latest period end on or before today (spec 7.3, tax cards roll over from the period
// end), never every period since incorporation, so an old company does not open with a stack of
// overdue returns (spec 5.6).

// The financial year end that closes the current cycle: the latest one on or before today, or
// the first one after incorporation when the company is younger than a year.
export function currentYearEnd(
  yearEnd: MonthDay,
  today: IsoDate,
  incorporationDate: IsoDate,
): IsoDate {
  const latest = latestOnOrBefore(yearEnd, today);
  return isBefore(latest, incorporationDate) ? nextAfter(yearEnd, incorporationDate) : latest;
}

export function nextYearEnd(yearEnd: MonthDay, after: IsoDate): IsoDate {
  return nextAfter(yearEnd, after);
}

// Spec 11.3 turnover question: quarterly. Calendar quarters, the plain reading of "quarterly".
const QUARTER_ENDS: readonly MonthDay[] = ['03-31', '06-30', '09-30', '12-31'];

export function currentQuarterEnd(today: IsoDate): IsoDate {
  let best: IsoDate | null = null;
  for (const monthDay of QUARTER_ENDS) {
    const candidate = latestOnOrBefore(monthDay, today);
    if (best === null || isBefore(best, candidate)) {
      best = candidate;
    }
  }
  if (best === null) {
    throw new Error('no quarter end');
  }
  return best;
}

export function nextQuarterEnd(after: IsoDate): IsoDate {
  return addMonths(after, 3);
}

// Tax periods end on month ends; a period end on the last day of a month steps to the last day of
// the target month, so 30 September plus a quarter is 31 December, not 30 December, and 29 February
// plus a year is 28 February. Any other day steps as addMonths does.
export function stepPeriodEnd(end: IsoDate, months: number): IsoDate {
  return end === lastDayOfMonth(end)
    ? lastDayOfMonth(addMonths(firstDayOfMonth(end), months))
    : addMonths(end, months);
}

// Spec 11.3 VAT: the tax period ends step from any one known period end by the period length.
// Returns the latest period end on or before today.
export function currentVatPeriodEnd(
  anchor: IsoDate,
  periodMonths: number,
  today: IsoDate,
): IsoDate {
  let current = anchor;
  // Step back while the anchor is ahead of today, then forward while the next end is not.
  while (isBefore(today, current)) {
    current = stepPeriodEnd(current, -periodMonths);
  }
  for (;;) {
    const next = stepPeriodEnd(current, periodMonths);
    if (isOnOrAfter(today, next)) {
      current = next;
    } else {
      return current;
    }
  }
}

// Spec 11.3 wages: due on the first of the month (from 1 June 2026, confirmed). The current
// cycle is the first of this month.
export function currentPayDay(today: IsoDate): IsoDate {
  return firstDayOfMonth(today);
}

export function nextPayDay(after: IsoDate): IsoDate {
  return firstDayOfMonth(addMonths(after, 1));
}

export function currentMonthEnd(today: IsoDate): IsoDate {
  return lastDayOfMonth(today);
}

export function nextMonthEnd(after: IsoDate): IsoDate {
  return lastDayOfMonth(addMonths(firstDayOfMonth(after), 1));
}
