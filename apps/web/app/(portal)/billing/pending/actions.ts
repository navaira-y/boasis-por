"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { activateSubscription } from "@/lib/billing";
import { isKeyError } from "@/lib/domain";
import { rateLimit } from "@/lib/ratelimit";

export interface FreeState {
  ok: boolean;
  error?: string;
}

const KEY_MSG =
  "Could not activate: the server key is misconfigured. The site owner needs to fix SUPABASE_SERVICE_ROLE_KEY.";

/**
 * Solo plan: first 12 months free, no card, no checkout. One free year per
 * account ever (refused when the subscription was activated before).
 * Year-2 charging is a follow-up (dunning + checkout before period end).
 */
export async function activateFreeYearAction(
  _prev: FreeState,
  _formData: FormData
): Promise<FreeState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email_confirmed_at) redirect("/signup");

  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`free-year:${user.id}:${ip}`, 5, 3_600_000).ok) {
    return { ok: false, error: "Too many attempts. Please try again later." };
  }

  try {
    const admin = await createAdminSupabase();
    const { data: sub, error: subReadError } = await admin
      .from("subscriptions")
      .select("id, status, activated_at")
      .eq("profile_id", user.id)
      .maybeSingle<{ id: string; status: string; activated_at: string | null }>();
    if (subReadError && isKeyError(subReadError)) {
      console.error("activateFreeYear: service key misconfigured");
      return { ok: false, error: KEY_MSG };
    }
    if (!sub || (sub.status !== "pending" && sub.status !== "incomplete")) {
      return { ok: false, error: "This subscription cannot be activated." };
    }
    if (sub.activated_at) {
      return { ok: false, error: "The free year was already used on this account." };
    }

    const { data: plan, error: planReadError } = await admin
      .from("plans")
      .select("free_months, price_fils")
      .eq("id", "solo")
      .eq("active", true)
      .maybeSingle<{ free_months: number; price_fils: number | null }>();
    if (planReadError && isKeyError(planReadError)) {
      console.error("activateFreeYear: service key misconfigured");
      return { ok: false, error: KEY_MSG };
    }
    if (!plan || plan.free_months <= 0) {
      return { ok: false, error: "The free year is not available right now." };
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + plan.free_months);

    await activateSubscription(admin, {
      provider: "free",
      providerEventId: `free-year:${sub.id}`,
      profileId: user.id,
      subscriptionId: sub.id,
      planId: "solo",
      providerSubscriptionId: `free_${sub.id}`,
      periodStart: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (e) {
    if (isKeyError(e)) {
      console.error("activateFreeYear: service key misconfigured");
      return { ok: false, error: KEY_MSG };
    }
    const raw = e instanceof Error ? e.message : String(e ?? "");
    const extra = process.env.NODE_ENV !== "production" && raw ? ` (tech: ${raw})` : "";
    return { ok: false, error: `Could not activate the free year. Please try again.${extra}` };
  }

  redirect("/billing/success");
}
