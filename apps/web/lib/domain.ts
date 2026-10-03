/**
 * Pure domain rules for price-based access. No I/O here, so every rule is
 * unit-tested (see lib/__tests__). The DB trigger mirrors canAddCompany —
 * the two must never disagree.
 */

export type PlanId = "solo" | "trio" | "enterprise";
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

/** Company limit from the plan. NULL max = unlimited (enterprise). Mirrored by the DB trigger. */
export function canAddCompany(
  status: SubscriptionStatus,
  companyCount: number,
  maxCompanies: number | null
): boolean {
  if (!isPortalAccessible(status)) return false;
  if (companyCount < 0) return false;
  if (maxCompanies === null) return true;
  if (maxCompanies < 1) return false;
  return companyCount < maxCompanies;
}

/** Stripe price lookup keys (same in test + live mode — no env juggling). */
export function stripePriceLookupKey(planId: PlanId): string {
  if (planId === "solo") return "solo_monthly";
  if (planId === "trio") return "trio_monthly";
  throw new Error("enterprise has no self-checkout price (contact-led)");
}

/** Days before period end when renewal reminders go out. */
export const REMINDER_SCHEDULE = [30, 14, 7, 1] as const;

/** YYYY-MM-DD of the instant in Asia/Dubai (formatToParts: deterministic). */
export function dubaiDayKey(instant: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole calendar days from Dubai-today until the Dubai day of period end. */
export function daysUntilDubaiDay(periodEndIso: string, now = new Date()): number {
  const [y1, m1, d1] = dubaiDayKey(now).split("-").map(Number);
  const [y2, m2, d2] = dubaiDayKey(new Date(periodEndIso)).split("-").map(Number);
  return (
    Math.round(
      (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000
    )
  );
}

/** "12 Oct 2026" in Asia/Dubai. */
export function displayDubaiDate(periodEndIso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(periodEndIso));
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

/**
 * True when a Supabase failure smells like a bad/missing service key
 * ("Invalid API key", bad JWT, missing env) rather than a data problem.
 * Pure message sniffing, so activation paths can name the real cause.
 */
export function isKeyError(detail: unknown): boolean {
  let msg = "";
  if (typeof detail === "string") {
    msg = detail;
  } else if (detail instanceof Error) {
    msg = detail.message;
  } else if (
    typeof detail === "object" &&
    detail !== null &&
    "message" in detail &&
    typeof (detail as { message: unknown }).message === "string"
  ) {
    msg = (detail as { message: string }).message;
  }
  return /invalid api key|invalid jwt|jwt expired|missing supabase_service_role_key/i.test(
    msg
  );
}
