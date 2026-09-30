import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canAddCompany,
  isPortalAccessible,
  type PlanId,
  type SubscriptionStatus,
} from "@/lib/domain";

export interface Entitlements {
  profileId: string;
  status: SubscriptionStatus | null;
  planId: PlanId | null;
  maxCompanies: number | null; // null = unlimited (enterprise)
  companyCount: number;
  canAccessPortal: boolean;
  canAddCompany: boolean;
}

/**
 * THE choke point for price-based access. Every gate in the app funnels
 * through here — UI hides buttons, but server mutations re-check via this.
 * Uses the admin client (reads subscriptions + counts companies).
 */
export async function getEntitlements(
  admin: SupabaseClient,
  profileId: string
): Promise<Entitlements> {
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, plan_id, plans(max_companies)")
    .eq("profile_id", profileId)
    .maybeSingle<{
      status: SubscriptionStatus;
      plan_id: PlanId | null;
      plans: { max_companies: number | null } | null;
    }>();

  const { count } = await admin
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("owner_profile_id", profileId);

  const companyCount = count ?? 0;
  const status = sub?.status ?? null;
  // No plan chosen yet = locked (0). Enterprise max = null = unlimited.
  const maxCompanies =
    sub?.plan_id && sub.plans ? sub.plans.max_companies : 0;

  return {
    profileId,
    status,
    planId: sub?.plan_id ?? null,
    maxCompanies,
    companyCount,
    canAccessPortal: status ? isPortalAccessible(status) : false,
    canAddCompany: status
      ? canAddCompany(status, companyCount, maxCompanies)
      : false,
  };
}

/** Exact spec copy for the plan-limit wall (Step 1 branch). */
export function planLimitMessage(planId: PlanId | null): string {
  if (planId === "solo") {
    return "Your plan covers 1 company. Upgrade to up to 3 companies for AED 90 a month.";
  }
  if (planId === "trio") {
    return "Your plan covers up to 3 companies. Contact us for Enterprise.";
  }
  return "Select a plan to add companies.";
}
