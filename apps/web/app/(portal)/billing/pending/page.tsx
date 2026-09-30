import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { formatAED } from "@/lib/domain";
import { CheckoutButton } from "./checkout-button";

/** Step 2 of 2: payment. Shows the plan picked at signup. */
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
    .select("status, plans!inner(name, max_companies, price_fils, currency)")
    .eq("profile_id", user.id)
    .maybeSingle<{
      status: string;
      plans: { name: string; max_companies: number; price_fils: number; currency: string };
    }>();
  if (!sub) redirect("/signup");
  if (sub.status === "active") redirect("/billing/success");

  const plan = sub.plans;

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">BOASIS PORTAL · STEP 2 OF 2 — PAYMENT</p>
        <h1>Activate your account</h1>
        <ol className="steps">
          <li className="done">1. Account</li>
          <li className="done">2. Payment</li>
        </ol>
        <div className="plan selected" style={{ cursor: "default", marginBottom: 20 }}>
          <h3>Your plan: {plan.name}</h3>
          <div className="price">
            {formatAED(plan.price_fils, plan.currency)}
            <span className="muted small"> /month</span>
          </div>
          <p className="muted small">
            {plan.max_companies === 1
              ? "1 company file, reminders, guidance, vault."
              : `Up to ${plan.max_companies} companies, one combined year, reminders, vault.`}
          </p>
        </div>
        <p className="muted">
          One payment activates everything — onboarding unlocks immediately
          after.
        </p>
        <CheckoutButton />
      </div>
    </main>
  );
}
