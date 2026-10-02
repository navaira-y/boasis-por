import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { listPlans } from "@/lib/plans";
import type { PlanId } from "@/lib/domain";
import { PlanSelector } from "./plan-selector";

/**
 * Step 2 of 2 (new account): choose a plan and activate.
 * Renewal (past_due): the plan ended — pay here to unlock immediately.
 */
export const dynamic = "force-dynamic";

export default async function BillingPendingPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const admin = await createAdminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, plan_id")
    .eq("profile_id", user.id)
    .maybeSingle<{ status: string; plan_id: PlanId | null }>();
  if (!sub) {
    // Self-heal: profile exists (terms accepted) but the subscription row was
    // never created (e.g. abandoned link-click signup) → create the pending
    // row inline. Bouncing to /signup would bounce straight back here.
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) redirect("/signup");
    const { error: healError } = await admin.from("subscriptions").insert({
      profile_id: user.id,
      status: "pending",
      provider: process.env.BILLING_PROVIDER ?? "stub",
    });
    if (healError && healError.code !== "23505") redirect("/signup");
  }
  if (sub?.status === "active") redirect("/billing/success");

  const isRenewal = sub?.status === "past_due";
  const plans = await listPlans();

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">
          {isRenewal ? "Boasis portal · Renewal" : "Boasis portal · Step 2 of 2 — Payment"}
        </p>
        <h1>{isRenewal ? "Your plan has ended" : "Choose your plan"}</h1>
        {!isRenewal && (
          <ol className="steps">
            <li className="done">1. Account</li>
            <li className="done">2. Payment</li>
          </ol>
        )}
        {isRenewal ? (
          <div className="notice">
            Your access is paused and your data is safe. Pay now to unlock
            the portal again immediately.
          </div>
        ) : (
          <p className="muted">
            Pick the plan that fits. Solo starts with a free year — no payment
            today.
          </p>
        )}
        <PlanSelector
          plans={plans}
          mode={isRenewal ? "renewal" : "signup"}
          currentPlan={sub?.plan_id ?? null}
        />
      </div>
    </main>
  );
}
