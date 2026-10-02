import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { getBillingProvider, getProviderId, audit } from "@/lib/billing";
import { isPlanId } from "@/lib/plans";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Paid self-checkout. Trio always pays online; Solo pays online ONLY as a
 * year-2+ renewal (past_due Solo subscription — first year is free, no card).
 * Enterprise is contact-led. A past_due subscription pays here to unlock.
 */
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => ({}));
  const planId = (body as { planId?: unknown }).planId;
  if (!isPlanId(planId) || planId === "enterprise") {
    return NextResponse.json(
      { error: "Choose Trio to pay online, or contact us for Enterprise." },
      { status: 400 }
    );
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
    .maybeSingle<{ id: string; status: string; plan_id: string | null }>();

  if (!sub) {
    return NextResponse.json(
      { error: "No subscription found. Please sign up again." },
      { status: 400 }
    );
  }
  if (sub.status === "active") {
    return NextResponse.json({ url: "/billing/success" });
  }
  if (sub.status !== "pending" && sub.status !== "incomplete" && sub.status !== "past_due") {
    return NextResponse.json(
      { error: "This subscription cannot be checked out. Please contact support." },
      { status: 400 }
    );
  }

  if (planId === "solo") {
    const isSoloRenewal = sub.status === "past_due" && sub.plan_id === "solo";
    if (!isSoloRenewal) {
      return NextResponse.json(
        { error: "Solo starts with a free year — no payment needed. Choose Solo to activate it." },
        { status: 400 }
      );
    }
  }

  const { data: plan } = await admin
    .from("plans")
    .select("id, price_fils")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle<{ id: string; price_fils: number | null }>();
  if (!plan || plan.price_fils === null) {
    return NextResponse.json({ error: "This plan is not available right now." }, { status: 400 });
  }

  let session;
  try {
    const provider = await getBillingProvider();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    session = await provider.createCheckoutSession({
      profileId: user.id,
      email: user.email,
      planId,
      subscriptionId: sub.id,
      successUrl: `${appUrl}/billing/success`,
      cancelUrl: `${appUrl}/billing/pending`,
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Checkout failed.";
    const detail =
      process.env.NODE_ENV !== "production" ? raw : "Checkout could not start.";
    return NextResponse.json({ error: detail }, { status: 400 });
  }

  await admin
    .from("subscriptions")
    .update({
      status: sub.status === "past_due" ? "past_due" : "incomplete",
      plan_id: planId,
      provider: getProviderId(),
      provider_checkout_id: session.providerCheckoutId,
    })
    .eq("id", sub.id);

  await audit(admin, {
    actor_profile_id: user.id,
    action: sub.status === "past_due" ? "checkout.renewal_started" : "checkout.started",
    entity: "subscription",
    entity_id: sub.id,
    meta: { provider: getProviderId(), plan: planId },
  });

  return NextResponse.json({ url: session.url });
}
