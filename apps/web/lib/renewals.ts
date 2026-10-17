import 'server-only';
import { addDubaiMonths, dubaiDate, dubaiDaysUntil, hasPeriodEnded } from '@boasis/rules';
import { PRODUCT_PLANS } from '@boasis/schema';
import type { AdminDbClient } from './supabase';
import { asRecord, asRows, asText } from './shape';

/**
 * Renewal arithmetic and the reminder ledger.
 *
 * Pure helpers (unit tested) plus two server jobs:
 *   planRenewals   writes the 30/14/7/1 day records that are due, once each
 *   pauseExpired   moves a subscription whose period ended to past_due, which
 *                  is what locks the portal and sends the visitor to /billing
 *
 * Sending is deliberately absent: SMTP (support@boasis.ae) arrives later, and
 * until then every reminder is RECORDED with its recipient, ready to send.
 * Day counting is in UAE time (UTC+4, no daylight saving), so "7 days before"
 * means seven UAE days, not seven UTC days.
 */

export const RENEWAL_THRESHOLDS = [30, 14, 7, 1] as const;
export type RenewalThreshold = (typeof RENEWAL_THRESHOLDS)[number];

export const FREE_YEAR_MONTHS = PRODUCT_PLANS[0].freeMonths;

export function uaeDay(date: Date): number {
  return dubaiDaysUntil(date, new Date('1970-01-01T00:00:00+04:00'));
}
export function addMonths(date: Date, months: number): Date {
  return addDubaiMonths(date, months);
}
export function freeYearEnd(startedAt: Date): Date {
  return addDubaiMonths(startedAt, FREE_YEAR_MONTHS);
}
export function daysUntil(target: Date, now: Date): number {
  return dubaiDaysUntil(target, now);
}

/** Thresholds that are due to be recorded today. */
export function dueThresholds(periodEnd: Date, now: Date): RenewalThreshold[] {
  const remaining = daysUntil(periodEnd, now);
  const due = RENEWAL_THRESHOLDS.filter(
    (threshold) => remaining <= threshold && remaining > threshold - 1,
  );
  return due;
}

export function periodEnded(periodEnd: Date, now: Date): boolean {
  return hasPeriodEnded(periodEnd.toISOString(), now.getTime());
}

export interface RenewalPlanResult {
  remindersRecorded: number;
  paused: number;
  checked: number;
}

interface SubscriptionRow {
  id: string;
  profile_id: string;
  status: string;
  current_period_end: string | null;
}

/**
 * Records due reminders and pauses expired subscriptions. Idempotent: the
 * unique key on (subscription_id, period_end, days_before) means a rerun, a
 * retry or a second replica can never double-send, matching the spec rule.
 */
export async function runRenewalSweep(
  admin: AdminDbClient,
  now: Date = new Date(),
): Promise<RenewalPlanResult> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('id,profile_id,status,current_period_end')
    .not('current_period_end', 'is', null);
  if (error !== null)
    throw new Error(`renewal sweep could not read subscriptions: ${error.message}`);

  const rows: SubscriptionRow[] = asRows(data).map((row) => {
    const record = asRecord(row);
    const periodEnd = asText(record.current_period_end);
    return {
      id: asText(record.id),
      profile_id: asText(record.profile_id),
      status: asText(record.status),
      current_period_end: periodEnd === '' ? null : periodEnd,
    };
  });
  let remindersRecorded = 0;
  let paused = 0;

  for (const row of rows) {
    if (row.current_period_end === null) continue;
    const periodEnd = new Date(row.current_period_end);
    if (row.status === 'active') {
      const due = dueThresholds(periodEnd, now);
      for (const threshold of due) {
        const recipients = await recipientFor(admin, row.profile_id);
        if (recipients === null) continue;
        for (const email of recipients) {
          const { error: insertError } = await admin.from('subscription_reminders').insert({
            subscription_id: row.id,
            period_end: dubaiDate(periodEnd),
            days_before: threshold,
            channel: 'email',
            recipient: email,
          });
          if (insertError === null) remindersRecorded += 1;
        }
      }
      if (periodEnded(periodEnd, now)) {
        const { error: pauseError } = await admin
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('id', row.id)
          .eq('status', 'active');
        if (pauseError === null) paused += 1;
      }
    }
  }

  return { remindersRecorded, paused, checked: rows.length };
}

/** Auth email for a profile, falling back to the onboarding second address. */
async function recipientFor(admin: AdminDbClient, profileId: string): Promise<string[] | null> {
  const { data, error } = await admin.auth.admin.getUserById(profileId);
  if (error !== null) return null;
  const email = asText(asRecord(asRecord(data).user).email);
  return email === '' ? null : [email];
}
