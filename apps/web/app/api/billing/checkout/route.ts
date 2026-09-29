import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { getBillingProvider, getProviderId, audit } from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";

/** Create (or resume) a checkout session for the caller's pending subscription. */
export async function POST() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Verify your email first." }, { status: 403 });
  }

  const rl = rateLimit(`checkout:${user.id}`, 10, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  const admin = await createAdminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("id, status, plan_id")
    .eq("profile_id", user.id)
    .maybeSingle<{ id: string; status: string; plan_id: "solo" | "trio" }>();

  if (!sub) {
    return NextResponse.json(
      { error: "No subscription found. Please sign up again." },
      { status: 400 }
    );
  }
  if (sub.status === "active") {
    return NextResponse.json({ url: "/billing/success" });
  }
  if (sub.status !== "pending" && sub.status !== "incomplete") {
    return NextResponse.json(
      { error: "This subscription cannot be checked out. Please contact support." },
      { status: 400 }
    );
  }

  const provider = getBillingProvider();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await provider.createCheckoutSession({
    profileId: user.id,
    email: user.email,
    planId: sub.plan_id,
    subscriptionId: sub.id,
    successUrl: `${appUrl}/billing/success`,
    cancelUrl: `${appUrl}/billing/pending`,
  });

  await admin
    .from("subscriptions")
    .update({
      status: "incomplete",
      provider: getProviderId(),
      provider_checkout_id: session.providerCheckoutId,
    })
    .eq("id", sub.id);

  await audit(admin, {
    actor_profile_id: user.id,
    action: "checkout.started",
    entity: "subscription",
    entity_id: sub.id,
    meta: { provider: getProviderId(), plan: sub.plan_id },
  });

  return NextResponse.json({ url: session.url });
}
