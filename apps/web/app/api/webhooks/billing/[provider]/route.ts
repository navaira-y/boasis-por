import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/lib/supabase";
import {
  activateSubscription,
  getBillingProvider,
  markCanceled,
  markPastDue,
} from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Billing webhooks — the ONLY path that activates subscriptions.
 * Signature is verified inside the provider's parseWebhook; the stub
 * provider has no webhooks and 404s here by design.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const rl = rateLimit(`webhook:${provider}`, 120, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429 });

  if (provider !== (process.env.BILLING_PROVIDER ?? "stub")) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }
  if (provider === "stub") {
    return NextResponse.json({ error: "stub has no webhooks" }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("stripe-signature") ??
    request.headers.get("x-webhook-signature");

  let events;
  try {
    const billing = await getBillingProvider();
    events = await billing.parseWebhook(rawBody, signature);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const admin = await createAdminSupabase();
  for (const event of events) {
    if (event.kind === "activated") {
      await activateSubscription(admin, {
        provider,
        providerEventId: event.providerEventId,
        profileId: event.profileId,
        subscriptionId: event.subscriptionId,
        planId: event.planId,
        providerSubscriptionId: event.providerSubscriptionId,
        periodStart: event.periodStart,
        periodEnd: event.periodEnd,
      });
    } else if (event.kind === "payment_failed") {
      await markPastDue(admin, {
        provider,
        providerEventId: event.providerEventId,
        subscriptionId: event.subscriptionId,
      });
    } else if (event.kind === "canceled") {
      await markCanceled(admin, {
        provider,
        providerEventId: event.providerEventId,
        subscriptionId: event.subscriptionId,
      });
    }
  }
  return NextResponse.json({ received: true });
}
