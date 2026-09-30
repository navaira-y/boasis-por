import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const admin = await createAdminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status, plans!inner(name)")
    .eq("profile_id", user.id)
    .maybeSingle<{ status: string; plans: { name: string } }>();

  // Webhook usually lands within seconds of the redirect. If it hasn't yet,
  // show a confirming state (with manual re-check) instead of bouncing back.
  if (sub?.status !== "active") {
    return (
      <main className="wrap">
        <div className="card">
          <p className="muted small">BOASIS PORTAL · PAYMENT</p>
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
        <p className="muted small">BOASIS PORTAL · ACTIVATED</p>
        <h1>Payment received — welcome in.</h1>
        <ol className="steps">
          <li className="done">1. Account</li>
          <li className="done">2. Payment</li>
        </ol>
        <div className="notice">
          Your <strong>{sub.plans.name}</strong> plan is active. Let&apos;s set
          up your first company.
        </div>
        <Link className="btn secondary" href="/onboarding">
          Start onboarding →
        </Link>
      </div>
    </main>
  );
}
