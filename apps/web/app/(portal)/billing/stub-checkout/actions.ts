"use server";

import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { activateSubscription } from "@/lib/billing";
import type { PlanId } from "@/lib/domain";

/** DEV ONLY (+ explicit demo deploys). Real production refuses before touching anything. */
export async function confirmStubPayment(formData: FormData): Promise<void> {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEMO_ALLOW_STUB !== "true"
  ) {
    throw new Error("stub billing is disabled in production");
  }
  const subscriptionId = String(formData.get("subscriptionId") ?? "");
  if (!subscriptionId) redirect("/billing/pending");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email_confirmed_at) redirect("/signup");

  const admin = await createAdminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, profile_id, plan_id, provider_checkout_id")
    .eq("id", subscriptionId)
    .eq("profile_id", user.id)
    .maybeSingle<{
      id: string;
      profile_id: string;
      plan_id: PlanId;
      provider_checkout_id: string | null;
    }>();
  if (!sub) redirect("/billing/pending");

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await activateSubscription(admin, {
    provider: "stub",
    providerEventId: `stub-confirm:${sub.id}:${sub.provider_checkout_id ?? "na"}`,
    profileId: sub.profile_id,
    subscriptionId: sub.id,
    planId: sub.plan_id,
    providerSubscriptionId: `stub_sub_${sub.id}`,
    periodStart: now.toISOString(),
    periodEnd: periodEnd.toISOString(),
  });

  redirect("/billing/success");
}
