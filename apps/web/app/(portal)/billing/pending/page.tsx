import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { listPlans } from "@/lib/plans";
import { PlanSelector } from "./plan-selector";

/** Step 2 of 2: choose a plan (nothing preselected) and activate. */
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
    .select("status")
    .eq("profile_id", user.id)
    .maybeSingle<{ status: string }>();
  if (!sub) redirect("/signup");
  if (sub.status === "active") redirect("/billing/success");

  const plans = await listPlans();

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">BOASIS PORTAL · STEP 2 OF 2 — PAYMENT</p>
        <h1>Choose your plan</h1>
        <ol className="steps">
          <li className="done">1. Account</li>
          <li className="done">2. Payment</li>
        </ol>
        <p className="muted">
          Pick the plan that fits. Solo starts with a free year — no payment
          today.
        </p>
        <PlanSelector plans={plans} />
      </div>
    </main>
  );
}
