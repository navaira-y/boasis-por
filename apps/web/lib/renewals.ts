import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { audit } from "@/lib/billing";
import { getMailer } from "@/lib/mailer";
import {
  REMINDER_SCHEDULE,
  daysUntilDubaiDay,
  displayDubaiDate,
  dubaiDayKey,
  formatAED,
  type PlanId,
} from "@/lib/domain";

/**
 * Renewal engine. Runs once a day (GET /api/cron/renewals):
 *  1. Email reminders 30/14/7/1 days before an ACTIVE period ends.
 *  2. At period end, flip active → past_due (portal locks via middleware)
 *     and email an "access paused" notice with a pay-to-unlock link.
 *
 * Idempotency: subscription_reminders has a unique
 * (subscription_id, period_end, days_before) key — a retried run can never
 * double-email, and expiry uses a conditional update so concurrent runs
 * cannot double-expire. All day math is Asia/Dubai calendar days.
 */

export interface RenewalRunResult {
  remindersSent: number;
  pausedNoticesSent: number;
  expired: number;
  errors: string[];
}

async function reminderSent(
  admin: SupabaseClient,
  subscriptionId: string,
  periodEndDay: string,
  daysBefore: number
): Promise<boolean> {
  const { data } = await admin
    .from("subscription_reminders")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("period_end", periodEndDay)
    .eq("days_before", daysBefore)
    .maybeSingle();
  return !!data;
}

async function recordReminder(
  admin: SupabaseClient,
  args: {
    subscriptionId: string;
    periodEndDay: string;
    daysBefore: number;
    recipient: string;
  }
): Promise<boolean> {
  const { error } = await admin.from("subscription_reminders").insert({
    subscription_id: args.subscriptionId,
    period_end: args.periodEndDay,
    days_before: args.daysBefore,
    channel: "email",
    recipient: args.recipient,
  });
  // 23505 = another run recorded it first → treat as already handled.
  if (error && error.code !== "23505") throw new Error(error.message);
  return !error;
}

interface PlanJoin {
  name: string;
  price_fils: number | null;
  currency: string;
}

interface ActiveRow {
  id: string;
  profile_id: string;
  plan_id: PlanId;
  current_period_end: string;
  // PostgREST returns one object for this many-to-one join, but the client
  // types it as an array — normalize at the read site.
  plans: PlanJoin[] | PlanJoin | null;
}

function joinedPlan(row: ActiveRow): PlanJoin | null {
  if (!row.plans) return null;
  return Array.isArray(row.plans) ? (row.plans[0] ?? null) : row.plans;
}

export async function processRenewals(
  admin: SupabaseClient,
  opts: { now?: Date; appUrl: string }
): Promise<RenewalRunResult> {
  const now = opts.now ?? new Date();
  const result: RenewalRunResult = {
    remindersSent: 0,
    pausedNoticesSent: 0,
    expired: 0,
    errors: [],
  };
  const mailer = getMailer();
  const payUrl = `${opts.appUrl}/billing/pending`;

  const { data: active, error: activeError } = await admin
    .from("subscriptions")
    .select("id, profile_id, plan_id, current_period_end, plans(name, price_fils, currency)")
    .eq("status", "active")
    .not("current_period_end", "is", null);
  if (activeError) throw new Error(`renewals query failed: ${activeError.message}`);

  for (const row of (active ?? []) as ActiveRow[]) {
    const daysLeft = daysUntilDubaiDay(row.current_period_end, now);
    const periodEndDay = dubaiDayKey(new Date(row.current_period_end));
    try {
      // Email lives in auth.users (no email column on profiles by design);
      // one admin lookup per renewing subscription is fine at Phase-1 scale.
      const { data: lookup } = await admin.auth.admin.getUserById(row.profile_id);
      const email = lookup?.user?.email;
      if (!email) {
        result.errors.push(`${row.id}: no email for profile ${row.profile_id}`);
        continue;
      }
      const plan = joinedPlan(row);
      const amountLine = plan?.price_fils
        ? `${formatAED(plan.price_fils, plan.currency)}/month`
        : "the renewal amount";

      if (daysLeft < 0) {
        // Expire: conditional update wins exactly once across concurrent runs.
        const { data: won } = await admin
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("id", row.id)
          .eq("status", "active")
          .select("id");
        if (!won || won.length === 0) continue;
        result.expired += 1;
        await audit(admin, {
          actor_profile_id: row.profile_id,
          action: "subscription.expired",
          entity: "subscription",
          entity_id: row.id,
          meta: { period_end: row.current_period_end, plan: row.plan_id },
        });
        if (await reminderSent(admin, row.id, periodEndDay, 0)) continue;
        await mailer.sendAccessPaused({
          to: email,
          planName: plan?.name ?? row.plan_id,
          daysLeft: 0,
          periodEndDubai: displayDubaiDate(row.current_period_end),
          amountLine,
          payUrl,
        });
        await recordReminder(admin, {
          subscriptionId: row.id,
          periodEndDay,
          daysBefore: 0,
          recipient: email,
        });
        result.pausedNoticesSent += 1;
        continue;
      }

      if (!(REMINDER_SCHEDULE as readonly number[]).includes(daysLeft)) continue;
      if (await reminderSent(admin, row.id, periodEndDay, daysLeft)) continue;
      await mailer.sendRenewalReminder({
        to: email,
        planName: plan?.name ?? row.plan_id,
        daysLeft,
        periodEndDubai: displayDubaiDate(row.current_period_end),
        amountLine,
        payUrl,
      });
      await recordReminder(admin, {
        subscriptionId: row.id,
        periodEndDay,
        daysBefore: daysLeft,
        recipient: email,
      });
      result.remindersSent += 1;
      await audit(admin, {
        actor_profile_id: row.profile_id,
        action: "subscription.reminder_sent",
        entity: "subscription",
        entity_id: row.id,
        meta: { days_before: daysLeft, period_end: row.current_period_end },
      });
    } catch (e) {
      // One bad row must never abort the whole daily run.
      result.errors.push(`${row.id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return result;
}
