import { describe, expect, it } from 'vitest';
import {
  BILLING_COPY,
  BillingPlanRow,
  BillingSnapshot,
  PRODUCT_PLANS,
  SubscriptionRow,
} from './billing';
const row = {
  plan_id: 'solo',
  status: 'active',
  provider: 'free',
  current_period_start: '2026-10-17T09:00:00+00:00',
  current_period_end: '2027-10-17T09:00:00+00:00',
  free_year_used_at: '2026-10-17T09:00:00+00:00',
};

describe('subscription data contract', () => {
  it('parses real Supabase instants and preserves their end, without deriving a fresh free year', () => {
    expect(SubscriptionRow.parse(row).periodEnd).toBe(row.current_period_end);
    expect(SubscriptionRow.parse({ ...row, current_period_end: null }).periodEnd).toBeNull();
  });
  it.each([
    { plan_id: 'standard' },
    { plan_id: 'something-new' },
    { status: 'unknown' },
    { current_period_end: '2027-10-17' },
    { current_period_end: 'not a date' },
    { current_period_end: undefined },
    { provider: undefined },
  ])('refuses unknown or incomplete subscription facts: %j', (patch) => {
    expect(SubscriptionRow.safeParse({ ...row, ...patch }).success).toBe(false);
  });
  it('keeps a missing subscription distinct from invalid data', () => {
    expect(BillingSnapshot.parse({ subscription: null, plans: [] }).subscription).toBeNull();
    expect(BillingSnapshot.safeParse({ subscription: {}, plans: [] }).success).toBe(false);
  });
  it('uses named plans, not legacy database display labels', () => {
    expect(
      BillingPlanRow.parse({
        id: 'solo',
        name: 'Standard',
        max_companies: 1,
        price_fils: 3000,
        free_months: 12,
        currency: 'AED',
      }).name,
    ).toBe('Solo');
  });
  it('does not default an unknown catalog id to Solo', () => {
    expect(
      BillingPlanRow.safeParse({
        id: 'unknown',
        max_companies: 1,
        price_fils: 3000,
        free_months: 12,
        currency: 'AED',
      }).success,
    ).toBe(false);
  });
});

describe('latest meeting overrides the PDF and team working model', () => {
  it('names all plans and publishes only Solo as live', () => {
    expect(
      PRODUCT_PLANS.map((plan) => [
        plan.name,
        plan.maxCompanies,
        plan.priceFils,
        plan.freeMonths,
        plan.live,
      ]),
    ).toEqual([
      ['Solo', 1, 3000, 12, true],
      ['Trio', 3, 9000, 0, false],
      ['Enterprise', null, null, 0, false],
    ]);
  });
  it('states the free-year, early-access and two-trigger rules explicitly', () => {
    expect(BILLING_COPY.solo).toContain('free for 12 months, no card required');
    expect(BILLING_COPY.earlyAccess).toContain('no payment and no plan choice');
    expect(BILLING_COPY.payment).toContain('never before email verification');
    expect(BILLING_COPY.payment).toContain('second company or when your free year ends');
  });
});
