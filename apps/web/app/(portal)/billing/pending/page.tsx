import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { listPlans } from "@/lib/plans";
import type { PlanId } from "@/lib/domain";
import { PlanSelector } from "./plan-selector";

/**
 * Step 2 of 2 (new account): choose a plan and activate.
 * Renewal (past_due): the plan ended — pay here to unlock immediately.
 */
export const dynamic = "force-dynamic";

export default async function BillingPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  // Own-session reads (RLS owner-read): this page must render even when the
  // service key is misconfigured. Activation itself still needs the key —
  // and names it (see the server-key notice below).
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, plan_id")
    .eq("profile_id", user.id)
    .maybeSingle<{ status: string; plan_id: PlanId | null }>();
  if (!sub) {
    // Self-heal: profile exists (terms accepted) but the subscription row was
    // never created (e.g. abandoned link-click signup) → create the pending
    // row inline. Bouncing to /signup would bounce straight back here.
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) redirect("/signup");
    // Own-session insert (migration 0005: owners may insert their OWN
    // pending row; activation stays server-only).
    const { error: healError } = await supabase.from("subscriptions").insert({
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
        {params.error === "server-key" && (
          <div className="error" style={{ marginTop: 12 }}>
            The payment could not complete: the server key is misconfigured.
            The site owner needs to fix SUPABASE_SERVICE_ROLE_KEY.
          </div>
        )}
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
