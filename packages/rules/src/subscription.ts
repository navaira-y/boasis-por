import type { IsoDate, ProductPlan, Subscription, SubscriptionCountdown } from '@boasis/schema';
import { addDays, addMonths, dayNumber, formatIsoDate, parseIsoDate } from './calendar';

const DAY_MS = 86_400_000;
const DUBAI_OFFSET_MS = 14_400_000;

// Dubai has no DST. All instant-to-calendar conversion and date arithmetic live here.
export function dubaiDate(instant: number | Date | string): IsoDate {
  const ms = typeof instant === 'number' ? instant : new Date(instant).getTime();
  if (!Number.isFinite(ms)) throw new Error('Invalid subscription instant');
  return new Date(ms + DUBAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function dubaiDaysUntil(target: number | Date | string, now: number | Date): number {
  return dayNumber(dubaiDate(target)) - dayNumber(dubaiDate(now));
}

export function hasPeriodEnded(periodEnd: string | null, now: number): boolean {
  if (periodEnd === null) return false;
  const end = Date.parse(periodEnd);
  return Number.isFinite(end) && end <= now;
}

export function isFreeYear(subscription: Subscription): boolean {
  return subscription.planId === 'solo' && subscription.provider === 'free';
}

export function canUseSubscription(subscription: Subscription, now: number): boolean {
  return (
    subscription.status === 'active' &&
    subscription.periodEnd !== null &&
    Number.isFinite(Date.parse(subscription.periodEnd)) &&
    !hasPeriodEnded(subscription.periodEnd, now)
  );
}

export function subscriptionCountdown(
  subscription: Subscription | null,
  now: number,
): SubscriptionCountdown | null {
  if (subscription === null) return null;
  if (
    subscription.status === 'past_due' ||
    subscription.status === 'canceled' ||
    hasPeriodEnded(subscription.periodEnd, now)
  ) {
    return { kind: 'ended' };
  }
  if (subscription.status !== 'active') return { kind: 'inactive' };
  if (subscription.periodEnd === null || !Number.isFinite(Date.parse(subscription.periodEnd)))
    return { kind: 'unknown' };
  const today = dubaiDate(now);
  const end = dubaiDate(subscription.periodEnd);
  const totalDays = Math.max(0, dayNumber(end) - dayNumber(today));
  // Paid monthly periods use days only. Longer custom periods use calendar months and
  // days, based on their actual start/end, not an assumed Enterprise billing cadence.
  const longerPeriod =
    subscription.periodStart !== null &&
    dayNumber(end) > dayNumber(addMonths(dubaiDate(subscription.periodStart), 1));
  if (!isFreeYear(subscription) && !longerPeriod) {
    return { kind: 'remaining', months: null, days: totalDays, totalDays, warning: totalDays <= 7 };
  }
  const startParts = parseIsoDate(today);
  const endParts = parseIsoDate(end);
  let months = (endParts.year - startParts.year) * 12 + endParts.month - startParts.month;
  if (dayNumber(addMonths(today, months)) > dayNumber(end)) months -= 1;
  months = Math.max(0, months);
  const days = dayNumber(end) - dayNumber(addMonths(today, months));
  return { kind: 'remaining', months, days, totalDays, warning: totalDays <= 7 };
}

export function countdownLabel(countdown: SubscriptionCountdown): string {
  switch (countdown.kind) {
    case 'ended':
      return 'Plan ended — renew to unlock';
    case 'inactive':
      return 'Plan not active';
    case 'unknown':
      return 'Period end unavailable';
    case 'remaining': {
      const days = `${String(countdown.days)} day${countdown.days === 1 ? '' : 's'}`;
      return countdown.months === null
        ? `${days} left`
        : `${String(countdown.months)} month${countdown.months === 1 ? '' : 's'}, ${days} left`;
    }
  }
}

export function afterPeriodLine(subscription: Subscription, plan: ProductPlan | undefined): string {
  if (plan === undefined) return 'Plan pricing is unavailable. Please try again.';
  if (subscription.planId === 'enterprise')
    return 'Custom companies and custom pricing. Contact us about your next period.';
  if (plan.priceFils === null) return 'Plan pricing is unavailable. Please contact us.';
  const price = `AED ${String(plan.priceFils / 100)}/month`;
  const companies =
    plan.maxCompanies === null
      ? 'custom companies'
      : plan.maxCompanies === 1
        ? '1 company'
        : `up to ${String(plan.maxCompanies)} companies`;
  return isFreeYear(subscription)
    ? `After your free year: ${price}, ${companies}.`
    : `After this period: ${price}, ${companies}.`;
}

export function subscriptionStatusLabel(subscription: Subscription, now: number): string {
  if (hasPeriodEnded(subscription.periodEnd, now) && subscription.status === 'active')
    return 'Period ended';
  return {
    active: 'Active',
    past_due: 'Payment due',
    canceled: 'Cancelled',
    pending: 'Not started',
    incomplete: 'Not finished',
  }[subscription.status];
}

// The clock adapter schedules the exact Dubai rollover/period end, plus a bounded
// heartbeat. Resume/focus also resynchronises after a sleeping or throttled tab.
export function nextSubscriptionClockDelay(now: number, periodEnd: string | null): number {
  const midnight = Date.parse(`${addDays(dubaiDate(now), 1)}T00:00:00+04:00`);
  const end = periodEnd === null ? NaN : Date.parse(periodEnd);
  return Math.max(1, Math.min(60_000, midnight - now, end > now ? end - now : Infinity));
}

export function addDubaiMonths(instant: Date, months: number): Date {
  const ms = instant.getTime();
  const day = dubaiDate(ms);
  const target = formatIsoDate(parseIsoDate(addMonths(day, months)));
  const timeOfDay = (((ms + DUBAI_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return new Date(Date.parse(`${target}T00:00:00+04:00`) + timeOfDay);
}
