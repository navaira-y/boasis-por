import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canTransitionStatus, type PlanId } from "@/lib/domain";

/**
 * Provider-agnostic billing. Real gateways (Stripe/Telr/PayTabs) implement
 * BillingProvider — the signup→pay→activate flow never changes.
 */

export type BillingProviderId = "stub" | "stripe" | "telr" | "paytabs";

export interface CheckoutArgs {
  profileId: string;
  email: string;
  planId: PlanId;
  subscriptionId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  url: string;
  providerCheckoutId: string;
}

export type BillingEvent =
  | {
      kind: "activated";
      providerEventId: string;
      profileId: string;
      subscriptionId: string;
      planId: PlanId;
      providerSubscriptionId: string;
      periodStart: string;
      periodEnd: string;
    }
  | {
      kind: "payment_failed";
      providerEventId: string;
      profileId: string;
      subscriptionId: string;
    }
  | {
      kind: "canceled";
      providerEventId: string;
      profileId: string;
      subscriptionId: string;
    };

export interface BillingProvider {
  readonly id: BillingProviderId;
  createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession>;
  /** Verify signature + parse raw webhook body into events. */
  parseWebhook(rawBody: string, signature: string | null): Promise<BillingEvent[]>;
}

/**
 * DEV ONLY fake gateway. Hard-refuses to run in production — except on an
 * explicit demo deploy (DEMO_ALLOW_STUB=true), so the client demo can click
 * end-to-end checkout without a real gateway. NEVER set on real production.
 */
class StubBillingProvider implements BillingProvider {
  readonly id = "stub" as const;

  async createCheckoutSession(args: CheckoutArgs): Promise<CheckoutSession> {
    if (
      process.env.NODE_ENV === "production" &&
      process.env.DEMO_ALLOW_STUB !== "true"
    ) {
      throw new Error("stub billing is disabled in production");
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    return {
      url: `${appUrl}/billing/stub-checkout?sid=${args.subscriptionId}`,
      providerCheckoutId: `stub_${args.subscriptionId}`,
    };
  }

  async parseWebhook(): Promise<BillingEvent[]> {
    throw new Error("stub provider has no webhooks (uses dev confirm route)");
  }
}

export async function getBillingProvider(): Promise<BillingProvider> {
  const id = (process.env.BILLING_PROVIDER ?? "stub") as BillingProviderId;
  switch (id) {
    case "stub":
      return new StubBillingProvider();
    case "stripe": {
      const { StripeBillingProvider } = await import("@/lib/billing-stripe");
      return new StripeBillingProvider();
    }
    default:
      throw new Error(`billing provider "${id}" is not configured`);
  }
}

export function getProviderId(): BillingProviderId {
  return (process.env.BILLING_PROVIDER ?? "stub") as BillingProviderId;
}

/** Append to the audit trail (server only, never fails the caller). */
export async function audit(
  admin: SupabaseClient,
  entry: {
    actor_profile_id: string | null;
    action: string;
    entity: string;
    entity_id: string;
    meta?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await admin.from("audit_log").insert({
      actor_profile_id: entry.actor_profile_id,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entity_id,
      meta: entry.meta ?? {},
    });
  } catch (e) {
    console.error("audit insert failed", e);
  }
}

/**
 * Flip pending/incomplete/past_due → active (first activation AND renewals).
 * Idempotent: the webhook_events ledger guarantees a retried event can never
 * double-activate. Renewal-safe: a late/out-of-order event must never rewind
 * the period, and activated_at keeps the FIRST activation ever (the free-year
 * guard depends on it).
 */
export async function activateSubscription(
  admin: SupabaseClient,
  args: {
    provider: string;
    providerEventId: string;
    profileId: string;
    subscriptionId: string;
    planId: PlanId;
    providerSubscriptionId: string;
    periodStart: string;
    periodEnd: string;
  }
): Promise<{ applied: boolean }> {
  const { error: ledgerError } = await admin.from("webhook_events").insert({
    provider: args.provider,
    provider_event_id: args.providerEventId,
    type: "subscription.activated",
    payload: args as unknown as Record<string, unknown>,
  });
  if (ledgerError) {
    // 23505 = already processed this event → idempotent no-op.
    if (ledgerError.code === "23505") return { applied: false };
    throw new Error(`webhook ledger insert failed: ${ledgerError.message}`);
  }

  const { data: current } = await admin
    .from("subscriptions")
    .select("status, activated_at, current_period_end")
    .eq("id", args.subscriptionId)
    .single<{
      status: Parameters<typeof canTransitionStatus>[0];
      activated_at: string | null;
      current_period_end: string | null;
    }>();

  if (!current || !canTransitionStatus(current.status, "active")) {
    throw new Error(`illegal status transition ${current?.status} → active`);
  }

  // Out-of-order event (older period arriving late): ledger-recorded, not applied.
  if (
    current.current_period_end &&
    new Date(args.periodEnd).getTime() <= new Date(current.current_period_end).getTime()
  ) {
    return { applied: false };
  }

  const nowIso = new Date().toISOString();
  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      plan_id: args.planId,
      provider: args.provider,
      provider_subscription_id: args.providerSubscriptionId,
      current_period_start: args.periodStart,
      current_period_end: args.periodEnd,
      activated_at: current.activated_at ?? nowIso,
    })
    .eq("id", args.subscriptionId);
  if (error) throw new Error(`activation update failed: ${error.message}`);

  await audit(admin, {
    actor_profile_id: args.profileId,
    action: "subscription.activated",
    entity: "subscription",
    entity_id: args.subscriptionId,
    meta: {
      provider: args.provider,
      plan: args.planId,
      renewal: current.status === "past_due",
    },
  });
  return { applied: true };
}

/** canceled at period end / immediately (legal transition enforced). */
export async function markCanceled(
  admin: SupabaseClient,
  args: { provider: string; providerEventId: string; subscriptionId: string }
): Promise<void> {
  const { error: ledgerError } = await admin.from("webhook_events").insert({
    provider: args.provider,
    provider_event_id: args.providerEventId,
    type: "subscription.canceled",
    payload: args as unknown as Record<string, unknown>,
  });
  if (ledgerError && ledgerError.code === "23505") return;
  if (ledgerError) throw new Error(ledgerError.message);

  const { data: current } = await admin
    .from("subscriptions")
    .select("status, profile_id")
    .eq("id", args.subscriptionId)
    .single<{ status: Parameters<typeof canTransitionStatus>[0]; profile_id: string }>();
  if (!current || !canTransitionStatus(current.status, "canceled")) return;

  await admin
    .from("subscriptions")
    .update({ status: "canceled", canceled_at: new Date().toISOString() })
    .eq("id", args.subscriptionId);
  await audit(admin, {
    actor_profile_id: current.profile_id,
    action: "subscription.canceled",
    entity: "subscription",
    entity_id: args.subscriptionId,
    meta: { provider: args.provider },
  });
}

/** past_due on failed recurring payment (legal transition enforced). */
export async function markPastDue(
  admin: SupabaseClient,
  args: { provider: string; providerEventId: string; subscriptionId: string }
): Promise<void> {
  const { error: ledgerError } = await admin.from("webhook_events").insert({
    provider: args.provider,
    provider_event_id: args.providerEventId,
    type: "subscription.payment_failed",
    payload: args as unknown as Record<string, unknown>,
  });
  if (ledgerError && ledgerError.code === "23505") return;
  if (ledgerError) throw new Error(ledgerError.message);

  const { data: current } = await admin
    .from("subscriptions")
    .select("status, profile_id")
    .eq("id", args.subscriptionId)
    .single<{ status: Parameters<typeof canTransitionStatus>[0]; profile_id: string }>();
  if (!current || !canTransitionStatus(current.status, "past_due")) return;

  await admin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("id", args.subscriptionId);
  await audit(admin, {
    actor_profile_id: current.profile_id,
    action: "subscription.past_due",
    entity: "subscription",
    entity_id: args.subscriptionId,
    meta: { provider: args.provider },
  });
}
