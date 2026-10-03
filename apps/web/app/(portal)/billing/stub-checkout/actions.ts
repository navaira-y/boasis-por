"use server";

import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { activateSubscription } from "@/lib/billing";
import { isKeyError } from "@/lib/domain";
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

  // Activation is server-only by design (users must never self-activate), so
  // a bad service key fails HERE loudly instead of looping silently.
  let sub: {
    id: string;
    profile_id: string;
    plan_id: PlanId;
    provider_checkout_id: string | null;
  } | null = null;
  try {
    const admin = await createAdminSupabase();
    const { data, error } = await admin
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
    if (error) throw error;
    sub = data;
  } catch (e) {
    console.error("confirmStubPayment: admin read failed", e);
    if (isKeyError(e)) redirect("/billing/pending?error=server-key");
  }
  if (!sub) redirect("/billing/pending");

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  try {
    const admin = await createAdminSupabase();
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
  } catch (e) {
    console.error("confirmStubPayment: activation failed", e);
    if (isKeyError(e)) redirect("/billing/pending?error=server-key");
    redirect("/billing/pending");
  }

  redirect("/billing/success");
}
