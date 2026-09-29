import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { formatAED } from "@/lib/domain";
import { confirmStubPayment } from "./actions";

/**
 * DEV ONLY fake checkout (BILLING_PROVIDER=stub). Never reachable in
 * production: the confirm action refuses, and the provider throws.
 */
export const dynamic = "force-dynamic";
export default async function StubCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string }>;
}) {
  if (process.env.NODE_ENV === "production") redirect("/billing/pending");
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
      plan_id: string;
      plans: { name: string; max_companies: number; price_fils: number; currency: string };
    }>();
  if (!sub) redirect("/billing/pending");
  if (sub.status === "active") redirect("/billing/success");

  const plan = sub.plans;

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">DEV CHECKOUT — NO REAL MONEY</p>
        <h1>Order summary</h1>
        <p>
          <strong>{plan.name}</strong>
          <br />
          {formatAED(plan.price_fils, plan.currency)} /month ·{" "}
          {plan.max_companies === 1 ? "1 company" : `up to ${plan.max_companies} companies`}
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
