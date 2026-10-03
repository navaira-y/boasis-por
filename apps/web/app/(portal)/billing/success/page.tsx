import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  // Own-session read (RLS owner-read): no service key needed on this path.
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status, provider, plans!inner(name)")
    .eq("profile_id", user.id)
    .maybeSingle<{ status: string; provider: string; plans: { name: string } }>();

  // Webhook usually lands within seconds of the redirect. If it hasn't yet,
  // show a confirming state (with manual re-check) instead of bouncing back.
  if (sub?.status !== "active") {
    return (
      <main className="wrap">
        <div className="card">
          <p className="eyebrow">Boasis portal · Payment</p>
          <h1>Confirming your payment…</h1>
          <p className="muted">
            This usually takes a few seconds. If this page doesn&apos;t change,
            your payment may still be processing.
          </p>
          <Link className="btn secondary" href="/billing/success">
            Check again
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">Boasis portal · Activated</p>
        <h1>Payment received — welcome in.</h1>
        <ol className="steps">
          <li className="done">1. Account</li>
          <li className="done">2. Payment</li>
        </ol>
        <div className="notice">
          Your <strong>{sub.plans.name}</strong> plan is active.{" "}
          {sub.provider === "free"
            ? "No payment was taken — your first year is free."
            : "Let's set up your first company."}
        </div>
        <Link className="btn secondary" href="/onboarding">
          Start onboarding →
        </Link>
      </div>
    </main>
  );
}
