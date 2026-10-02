import type { IsoDate } from '@boasis/schema';

// The only place in the app that touches the clock. Every date in the product is a calendar
// date in Asia/Dubai (spec 7.1), so today is read in that zone and handed on as YYYY-MM-DD;
// days left, states and act-by dates are then integer arithmetic in packages/rules.
const DUBAI = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Dubai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function today(now: Date = new Date()): IsoDate {
  // en-CA writes YYYY-MM-DD; the parts are read by name so a locale change cannot reorder them.
  const parts = DUBAI.formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

// The name the people, documents and settings screens read it by: the same Dubai day.
export function todayIso(): IsoDate {
  return today();
}

const DUBAI_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dubai',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

// The moment now in Asia/Dubai with its offset, for the audit trail: YYYY-MM-DDTHH:mm:ss+04:00.
// Dubai keeps one offset all year, so the offset is written as it is.
export function nowStamp(now: Date = new Date()): string {
  const parts = DUBAI_TIME.formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';
  return `${today(now)}T${pick('hour')}:${pick('minute')}:${pick('second')}+04:00`;
}
