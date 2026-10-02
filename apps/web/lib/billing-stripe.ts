import "server-only";
import Stripe from "stripe";
import { stripePriceLookupKey, type PlanId } from "@/lib/domain";
import type {
  BillingEvent,
  BillingProvider,
  CheckoutArgs,
  CheckoutSession,
} from "@/lib/billing";

/**
 * Stripe gateway: UAE bank cards + Apple/Google/Samsung Pay (automatic in
 * Checkout), monthly recurring, AED payouts to the client's bank.
 * Prices are resolved by LOOKUP KEY (solo_monthly / trio_monthly), so test
 * and live modes need no code or env changes — just create the same two
 * prices in each mode. Setup guide: docs/STRIPE.md
 */

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY");
  return new Stripe(key);
}

const priceCache = new Map<PlanId, { id: string; at: number }>();
const PRICE_CACHE_MS = 5 * 60_000;

async function resolvePriceId(client: Stripe, planId: PlanId): Promise<string> {
  const cached = priceCache.get(planId);
  if (cached && Date.now() - cached.at < PRICE_CACHE_MS) return cached.id;
  const lookup = stripePriceLookupKey(planId);
  const prices = await client.prices.list({
    lookup_keys: [lookup],
    active: true,
    limit: 1,
  });
  const price = prices.data[0];
  if (!price) {
    throw new Error(
      `Stripe price with lookup key "${lookup}" not found. Create it in the Stripe dashboard (see docs/STRIPE.md).`
    );
  }
  priceCache.set(planId, { id: price.id, at: Date.now() });
  return price.id;
}

function unixToIso(v: number | null | undefined, fallback: Date): string {
  if (typeof v === "number" && Number.isFinite(v)) {
    return new Date(v * 1000).toISOString();
  }
  return fallback.toISOString();
}

function subscriptionIdOf(
  value: string | Stripe.Subscription | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export class StripeBillingProvider implements BillingProvider {
  readonly id = "stripe" as const;

  async createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession> {
    const client = stripe();
    const priceId = await resolvePriceId(client, args.planId);
    const metadata = {
      profileId: args.profileId,
      subscriptionId: args.subscriptionId,
      planId: args.planId,
    };
    const session = await client.checkout.sessions.create({
      mode: "subscription",
      customer_email: args.email,
      line_items: [{ price: priceId, quantity: 1 }],
      metadata,
      subscription_data: { metadata },
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
    });
    if (!session.url || !session.id) {
      throw new Error("Stripe did not return a checkout URL");
    }
    return { url: session.url, providerCheckoutId: session.id };
  }

  async parseWebhook(
    rawBody: string,
    signature: string | null
  ): Promise<BillingEvent[]> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
    if (!signature) throw new Error("Missing Stripe signature");
    const client = stripe();
    const event = client.webhooks.constructEvent(rawBody, signature, secret);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const md: Record<string, string> = session.metadata ?? {};
        const subId = subscriptionIdOf(session.subscription);
        if (!md.profileId || !md.subscriptionId || !md.planId || !subId) {
          throw new Error("checkout session is missing metadata");
        }
        const sub = await client.subscriptions.retrieve(subId);
        // Periods live on the subscription item in current Stripe API versions.
        const item = sub.items.data[0];
        const now = new Date();
        const monthOut = new Date(now);
        monthOut.setMonth(monthOut.getMonth() + 1);
        return [
          {
            kind: "activated",
            providerEventId: event.id,
            profileId: md.profileId,
            subscriptionId: md.subscriptionId,
            planId: md.planId as PlanId,
            providerSubscriptionId: subId,
            periodStart: unixToIso(item?.current_period_start, now),
            periodEnd: unixToIso(item?.current_period_end, monthOut),
          },
        ];
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Current API: subscription link + metadata snapshot live under
        // invoice.parent.subscription_details.
        const details = invoice.parent?.subscription_details;
        const md: Record<string, string> = details?.metadata ?? {};
        if (md.profileId && md.subscriptionId) {
          return [
            {
              kind: "payment_failed",
              providerEventId: event.id,
              profileId: md.profileId,
              subscriptionId: md.subscriptionId,
            },
          ];
        }
        const subId = subscriptionIdOf(details?.subscription ?? null);
        if (!subId) return [];
        const sub = await client.subscriptions.retrieve(subId);
        const smd: Record<string, string> = sub.metadata ?? {};
        if (!smd.profileId || !smd.subscriptionId) return [];
        return [
          {
            kind: "payment_failed",
            providerEventId: event.id,
            profileId: smd.profileId,
            subscriptionId: smd.subscriptionId,
          },
        ];
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const md = sub.metadata ?? {};
        if (!md.profileId || !md.subscriptionId) return [];
        return [
          {
            kind: "canceled",
            providerEventId: event.id,
            profileId: md.profileId,
            subscriptionId: md.subscriptionId,
          },
        ];
      }
      default:
        return [];
    }
  }
}
