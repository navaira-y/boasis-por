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
 * Only Solo is live. Trio opens with online payment; Enterprise is contact us.
 */

import { PRODUCT_PLANS, type ProductPlan, type ProductPlanId } from '@boasis/schema';
export type PlanId = ProductPlanId;
export type Plan = ProductPlan;
export const LIVE_PLAN_IDS: readonly PlanId[] = ['solo'];
// Published offer only, never used for a real subscription or access decision.
export const PLAN_FALLBACK = PRODUCT_PLANS;

export function formatAED(fils: number | null, currency: string): string {
  if (fils === null) return 'Custom';
  const whole = Math.round(fils / 100);
  return `${currency} ${String(whole)}`;
}

export function planById(plans: readonly Plan[], id: PlanId): Plan | null {
  return plans.find((plan) => plan.id === id) ?? null;
}
