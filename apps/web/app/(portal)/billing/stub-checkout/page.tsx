import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { formatAED } from "@/lib/domain";
import { confirmStubPayment } from "./actions";

/**
 * Fake checkout (BILLING_PROVIDER=stub). Allowed in dev, plus explicit demo
 * deploys (DEMO_ALLOW_STUB=true) so the client demo clicks end-to-end
 * without a real gateway. Never reachable on real production.
 */
export const dynamic = "force-dynamic";
export default async function StubCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string }>;
}) {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.DEMO_ALLOW_STUB !== "true"
  ) {
    redirect("/billing/pending");
  }
  if ((process.env.BILLING_PROVIDER ?? "stub") !== "stub") {
    redirect("/billing/pending");
  }
  const { sid } = await searchParams;
  if (!sid) redirect("/billing/pending");

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signup");

  const admin = await createAdminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, status, plan_id, plans!inner(name, max_companies, price_fils, currency)")
    .eq("id", sid)
    .eq("profile_id", user.id)
    .maybeSingle<{
      id: string;
      status: string;
      plan_id: string | null;
      plans: { name: string; max_companies: number | null; price_fils: number | null; currency: string };
    }>();
  if (!sub) redirect("/billing/pending");
  if (sub.status === "active") redirect("/billing/success");
  // Trio checks out anytime; Solo only as a paid year-2+ renewal (past_due).
  const isRenewal = sub.status === "past_due";
  if (sub.plan_id !== "trio" && !(sub.plan_id === "solo" && isRenewal)) {
    redirect("/billing/pending");
  }

  const plan = sub.plans;
  if (plan.price_fils === null) {
    redirect("/billing/pending");
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">Demo checkout — no real money</p>
        <h1>Order summary</h1>
        {isRenewal && (
          <div className="notice">
            Renewal payment — the portal unlocks immediately after you pay.
          </div>
        )}
        <p>
          <strong>{plan.name}</strong>
          <br />
          {formatAED(plan.price_fils, plan.currency)} /month ·{" "}
          {plan.max_companies === 1 ? "1 company" : plan.max_companies === null ? "unlimited companies" : `up to ${plan.max_companies} companies`}
        </p>
        <form action={confirmStubPayment}>
          <input type="hidden" name="subscriptionId" value={sub.id} />
          <button className="btn" type="submit">
            Pay {formatAED(plan.price_fils, plan.currency)} (simulated)
          </button>
        </form>
        <p className="small muted" style={{ marginTop: 12 }}>
          A real provider (Stripe/Telr/…) replaces this page with hosted
          checkout. The activation path is identical.
        </p>
      </div>
    </main>
  );
}
