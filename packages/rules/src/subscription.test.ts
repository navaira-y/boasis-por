import { describe, expect, it } from 'vitest';
import { PRODUCT_PLANS, type Subscription } from '@boasis/schema';
import {
  addDubaiMonths,
  afterPeriodLine,
  canUseSubscription,
  countdownLabel,
  dubaiDate,
  dubaiDaysUntil,
  hasPeriodEnded,
  nextSubscriptionClockDelay,
  subscriptionCountdown,
} from './subscription';

const now = Date.parse('2026-10-17T08:00:00Z');
const free: Subscription = {
  planId: 'solo',
  status: 'active',
  provider: 'free',
  periodStart: '2026-06-29T08:00:00Z',
  periodEnd: '2027-06-29T08:00:00Z',
  freeYearUsedAt: '2026-06-29T08:00:00Z',
};
const label = (subscription: Subscription | null, instant = now) => {
  const countdown = subscriptionCountdown(subscription, instant);
  return countdown === null ? null : countdownLabel(countdown);
};

describe('real subscription countdown', () => {
  it('does not invent a missing subscription', () => {
    expect(label(null)).toBeNull();
  });
  it('uses the actual free-period end for calendar months and days', () => {
    expect(label(free)).toBe('8 months, 12 days left');
    expect(label({ ...free, periodEnd: '2026-11-18T08:00:00Z' })).toBe('1 month, 1 day left');
  });
  it.each(['solo', 'trio', 'enterprise'] as const)(
    'shows days only for paid monthly %s',
    (planId) => {
      expect(
        label({
          ...free,
          planId,
          provider: 'ziina',
          periodStart: '2026-10-17T08:00:00Z',
          periodEnd: '2026-11-17T08:00:00Z',
        }),
      ).toBe('31 days left');
    },
  );
  it('does not mistake year-two Solo for a free year', () => {
    const paid = {
      ...free,
      provider: 'ziina',
      periodStart: '2026-10-01T08:00:00Z',
      periodEnd: '2026-11-01T08:00:00Z',
    };
    expect(label(paid)).toBe('15 days left');
    expect(afterPeriodLine(paid, PRODUCT_PLANS[0])).toBe(
      'After this period: AED 30/month, 1 company.',
    );
  });
  it('uses the actual custom Enterprise period, not an invented monthly period', () => {
    expect(label({ ...free, planId: 'enterprise', provider: 'manual' })).toBe(
      '8 months, 12 days left',
    );
    expect(afterPeriodLine({ ...free, planId: 'enterprise' }, PRODUCT_PLANS[2])).toContain(
      'Custom companies and custom pricing',
    );
  });
  it.each([0, 1, 7, 8])('warns only at <=7 Dubai days (%i)', (days) => {
    const end =
      days === 0 ? '2026-10-17T15:00:00+04:00' : `2026-10-${String(17 + days)}T12:00:00+04:00`;
    expect(subscriptionCountdown({ ...free, periodEnd: end }, now)).toMatchObject({
      kind: 'remaining',
      totalDays: days,
      warning: days <= 7,
    });
  });
  it.each(['past_due', 'canceled'] as const)('ends %s even when its date is future', (status) => {
    expect(label({ ...free, status })).toBe('Plan ended — renew to unlock');
    expect(canUseSubscription({ ...free, status }, now)).toBe(false);
  });
  it.each(['pending', 'incomplete'] as const)('does not show %s as free access', (status) => {
    expect(label({ ...free, status })).toBe('Plan not active');
    expect(canUseSubscription({ ...free, status }, now)).toBe(false);
  });
  it('expires at the exact instant, not one calendar day later', () => {
    const end = '2026-10-17T09:00:00Z';
    const subscription = { ...free, periodEnd: end };
    expect(canUseSubscription(subscription, Date.parse(end) - 1)).toBe(true);
    expect(canUseSubscription(subscription, Date.parse(end))).toBe(false);
    expect(hasPeriodEnded(end, Date.parse(end))).toBe(true);
    expect(label(subscription, Date.parse(end))).toBe('Plan ended — renew to unlock');
  });
  it('treats missing period dates honestly and does not open the gate', () => {
    expect(label({ ...free, periodEnd: null })).toBe('Period end unavailable');
    expect(canUseSubscription({ ...free, periodEnd: null }, now)).toBe(false);
  });
  it('does not assume an unknown start means a monthly Enterprise contract', () => {
    expect(label({ ...free, planId: 'enterprise', provider: 'manual', periodStart: null })).toBe(
      '255 days left',
    );
  });
  it('does not substitute a published price for a failed real plan read', () => {
    expect(afterPeriodLine(free, undefined)).toContain('unavailable');
    expect(afterPeriodLine(free, PRODUCT_PLANS[0])).toBe(
      'After your free year: AED 30/month, 1 company.',
    );
  });
});

describe('Dubai boundaries and clamped calendar months', () => {
  it('rolls both displays over at Dubai midnight, regardless of UTC day', () => {
    expect(dubaiDate('2026-10-17T19:59:59.999Z')).toBe('2026-10-17');
    expect(dubaiDate('2026-10-17T20:00:00.000Z')).toBe('2026-10-18');
    expect(label(free, Date.parse('2026-10-17T19:59:59Z'))).toBe('8 months, 12 days left');
    expect(label(free, Date.parse('2026-10-17T20:00:00Z'))).toBe('8 months, 11 days left');
    expect(dubaiDaysUntil('2026-10-18T00:01:00+04:00', Date.parse('2026-10-17T19:59:00Z'))).toBe(1);
  });
  it.each([
    ['2026-01-31T08:00:00Z', '2026-02-28T08:00:00Z', '1 month, 0 days left'],
    ['2028-01-31T08:00:00Z', '2028-02-29T08:00:00Z', '1 month, 0 days left'],
    ['2028-02-29T08:00:00Z', '2029-02-28T08:00:00Z', '12 months, 0 days left'],
    ['2026-12-31T08:00:00Z', '2027-02-01T08:00:00Z', '1 month, 1 day left'],
  ])('clamps %s to %s', (start, end, expected) => {
    expect(label({ ...free, periodEnd: end }, Date.parse(start))).toBe(expected);
  });
  it('adds free-year months in the Dubai calendar, retaining the local time', () => {
    expect(addDubaiMonths(new Date('2026-01-30T21:30:00.123Z'), 1).toISOString()).toBe(
      '2026-02-27T21:30:00.123Z',
    );
    expect(addDubaiMonths(new Date('2028-02-28T21:30:00Z'), 12).toISOString()).toBe(
      '2029-02-27T21:30:00.000Z',
    );
  });
  it('schedules the exact midnight and exact end, even when under one minute away', () => {
    const nearMidnight = Date.parse('2026-10-17T19:59:59.750Z');
    expect(nextSubscriptionClockDelay(nearMidnight, null)).toBe(250);
    expect(nextSubscriptionClockDelay(now, new Date(now + 75).toISOString())).toBe(75);
    expect(nextSubscriptionClockDelay(now, null)).toBe(60_000);
  });
});
