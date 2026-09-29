/**
 * Pure domain rules for price-based access. No I/O here, so every rule is
 * unit-tested (see lib/__tests__). The DB trigger mirrors canAddCompany —
 * the two must never disagree.
 */

export type PlanId = "solo" | "trio";
export type SubscriptionStatus =
  | "pending"
  | "incomplete"
  | "active"
  | "past_due"
  | "canceled";

export const ACTIVE_STATUSES: SubscriptionStatus[] = ["active"];
export const TERMS_VERSION = "2026-09-29.v1";

/** Money is integer fils everywhere; formatted only at render. No floats. */
export function formatAED(fils: number, currency = "AED"): string {
  if (!Number.isInteger(fils) || fils < 0) throw new Error("invalid fils amount");
  return `${currency} ${(fils / 100).toFixed(2)}`;
}

/** Portal access: only an active subscription opens the gate. */
export function isPortalAccessible(status: SubscriptionStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Company limit from the plan. Mirrored by the DB trigger. */
export function canAddCompany(
  status: SubscriptionStatus,
  companyCount: number,
  maxCompanies: number
): boolean {
  if (!isPortalAccessible(status)) return false;
  if (companyCount < 0 || maxCompanies < 1) return false;
  return companyCount < maxCompanies;
}

/** Legal state machine for subscription.status. */
export function canTransitionStatus(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): boolean {
  const allowed: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    pending: ["incomplete", "active", "canceled"],
    incomplete: ["pending", "active", "canceled"],
    active: ["past_due", "canceled"],
    past_due: ["active", "canceled"],
    canceled: ["pending"], // re-subscribe starts a fresh pending cycle
  };
  return allowed[from].includes(to);
}
