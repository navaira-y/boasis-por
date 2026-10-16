/**
 * Plan shapes and display helpers. Pure and client-safe on purpose: the door
 * draws these in the browser, so nothing here may reach a server-only module
 * (the build enforces that). Reading the plans from the database lives in
 * plans-server.ts.
 *
 * Plans are public data and the database is the source of truth (migration
 * 0002). The fallback here exists only so the door can still draw its three
 * cards during a database hiccup; it is NEVER used for entitlements, which the
 * database trigger and the middleware gate enforce.
 *
 * Only Solo is purchasable until the Ziina gateway exists: the other two are
 * shown greyed out as "Opens soon" and a click is recorded as a wish.
 */

export type PlanId = 'solo' | 'trio' | 'enterprise';

export interface Plan {
  id: PlanId;
  name: string;
  maxCompanies: number | null;
  priceFils: number | null;
  freeMonths: number;
  currency: string;
  live: boolean;
}

export const LIVE_PLAN_IDS: readonly PlanId[] = ['solo'];

/** Mirrors migration 0002 exactly. Display only. */
export const PLAN_FALLBACK: readonly Plan[] = [
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
];

export function formatAED(fils: number | null, currency: string): string {
  if (fils === null) return 'Custom';
  const whole = Math.round(fils / 100);
  return `${currency} ${String(whole)}`;
}

export function planById(plans: readonly Plan[], id: PlanId): Plan | null {
  return plans.find((plan) => plan.id === id) ?? null;
}
