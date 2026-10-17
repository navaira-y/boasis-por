import { z } from 'zod';

export const ProductPlanId = z.enum(['solo', 'trio', 'enterprise']);
export type ProductPlanId = z.infer<typeof ProductPlanId>;
export const BillingStatus = z.enum(['pending', 'incomplete', 'active', 'past_due', 'canceled']);
export type BillingStatus = z.infer<typeof BillingStatus>;
export const PRODUCT_PLAN_NAMES = { solo: 'Solo', trio: 'Trio', enterprise: 'Enterprise' } as const;

export const ProductPlan = z.object({
  id: ProductPlanId,
  name: z.string().min(1),
  maxCompanies: z.number().int().positive().nullable(),
  priceFils: z.number().int().nonnegative().nullable(),
  freeMonths: z.number().int().nonnegative(),
  currency: z.literal('AED'),
  live: z.boolean(),
});
export type ProductPlan = z.infer<typeof ProductPlan>;

// Published offer, not a subscription or an entitlement fallback. Current meeting rules
// supersede the older PDF's day-one charge and the team's Standard working model.
export const PRODUCT_PLANS = [
  {
    id: 'solo',
    name: 'Solo',
    maxCompanies: 1,
    priceFils: 3000,
    freeMonths: 12,
    currency: 'AED',
    live: true,
  },
  {
    id: 'trio',
    name: 'Trio',
    maxCompanies: 3,
    priceFils: 9000,
    freeMonths: 0,
    currency: 'AED',
    live: false,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    maxCompanies: null,
    priceFils: null,
    freeMonths: 0,
    currency: 'AED',
    live: false,
  },
] as const satisfies readonly ProductPlan[];

export const BillingPlanRow = z
  .object({
    id: ProductPlanId,
    max_companies: z.number().int().positive().nullable(),
    price_fils: z.number().int().nonnegative().nullable(),
    free_months: z.number().int().nonnegative(),
    currency: z.literal('AED'),
  })
  .transform((row): ProductPlan => ({
    id: row.id,
    name: PRODUCT_PLAN_NAMES[row.id],
    maxCompanies: row.max_companies,
    priceFils: row.price_fils,
    freeMonths: row.free_months,
    currency: row.currency,
    live: row.id === 'solo',
  }));

const Instant = z.string().datetime({ offset: true });
export const Subscription = z.object({
  planId: ProductPlanId,
  status: BillingStatus,
  provider: z.string().min(1).nullable(),
  periodStart: Instant.nullable(),
  periodEnd: Instant.nullable(),
  freeYearUsedAt: Instant.nullable(),
});
export type Subscription = z.infer<typeof Subscription>;
export const SubscriptionRow = z
  .object({
    plan_id: ProductPlanId,
    status: BillingStatus,
    provider: z.string().min(1).nullable(),
    current_period_start: Instant.nullable(),
    current_period_end: Instant.nullable(),
    free_year_used_at: Instant.nullable(),
  })
  .transform((row): Subscription => ({
    planId: row.plan_id,
    status: row.status,
    provider: row.provider,
    periodStart: row.current_period_start,
    periodEnd: row.current_period_end,
    freeYearUsedAt: row.free_year_used_at,
  }));
export const SUBSCRIPTION_COLUMNS =
  'plan_id,status,provider,current_period_start,current_period_end,free_year_used_at';
export const BILLING_PLAN_COLUMNS = 'id,max_companies,price_fils,free_months,currency';
export const BillingSnapshot = z.object({
  subscription: Subscription.nullable(),
  plans: z.array(ProductPlan),
});
export type BillingSnapshot = z.infer<typeof BillingSnapshot>;

export type SubscriptionCountdown =
  | { kind: 'remaining'; months: number | null; days: number; totalDays: number; warning: boolean }
  | { kind: 'ended' | 'inactive' | 'unknown' };

export const BILLING_COPY = {
  payment:
    'Payment is only requested when adding a second company or when your free year ends, never before email verification. Online payment opens soon.',
  solo: 'Solo: 1 company, free for 12 months, no card required. Then AED 30/month.',
  trio: 'Trio: up to 3 companies, AED 90/month. Opens with online payment.',
  enterprise: 'Enterprise: custom companies and custom pricing.',
  earlyAccess: 'Early access starts free on Solo, with no payment and no plan choice.',
} as const;
