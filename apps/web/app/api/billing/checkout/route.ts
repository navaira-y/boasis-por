import { NextResponse } from "next/server";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { getBillingProvider, getProviderId, audit } from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Paid self-checkout. Only Trio checks out online: Solo starts with a free
 * year (no payment), Enterprise is contact-led. The plan arrives in the body
 * because it is chosen on the payment step — nothing is preselected.
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
  if (planId === "solo") {
    return NextResponse.json(
      { error: "Solo starts with a free year — no payment needed. Choose Solo to activate it." },
      { status: 400 }
    );
  }
  if (planId !== "trio") {
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
    .select("id, status")
    .eq("profile_id", user.id)
    .maybeSingle<{ id: string; status: string }>();

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

  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("id", "trio")
    .eq("active", true)
    .maybeSingle();
  if (!plan) {
    return NextResponse.json({ error: "This plan is not available right now." }, { status: 400 });
  }

  let session;
  try {
    const provider = await getBillingProvider();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    session = await provider.createCheckoutSession({
      profileId: user.id,
      email: user.email,
      planId: "trio",
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
      status: "incomplete",
      plan_id: "trio",
      provider: getProviderId(),
      provider_checkout_id: session.providerCheckoutId,
    })
    .eq("id", sub.id);

  await audit(admin, {
    actor_profile_id: user.id,
    action: "checkout.started",
    entity: "subscription",
    entity_id: sub.id,
    meta: { provider: getProviderId(), plan: "trio" },
  });

  return NextResponse.json({ url: session.url });
}
