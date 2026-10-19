import { readMfaState } from './mfa';
import 'server-only';
import type { VisitorDbClient } from './supabase';
import type { SubscriptionStatus } from './gate';
import { SUBSCRIPTION_COLUMNS, SubscriptionRow } from '@boasis/schema';
import { canUseSubscription, dubaiDaysUntil, hasPeriodEnded, isFreeYear } from '@boasis/rules';

/**
 * What this account may do right now, read with the USER'S OWN session so RLS
 * is the authority and a broken service key can never open or close the gate.
 */

export interface AccessSummary {
  status: SubscriptionStatus | null;
  planId: string | null;
  periodEnd: string | null;
  /** True while the first year is a gift: no gateway involved. */
  freeYear: boolean;
  daysLeft: number | null;
  canEnterPortal: boolean;
}

export async function accessForUser(
  client: VisitorDbClient,
  userId: string,
  now: Date = new Date(),
): Promise<AccessSummary> {
  const { data, error } = await client
    .from('subscriptions')
    .select(SUBSCRIPTION_COLUMNS)
    .eq('profile_id', userId)
    .maybeSingle();

  if (error !== null || data === null) {
    return {
      status: null,
      planId: null,
      periodEnd: null,
      freeYear: false,
      daysLeft: null,
      canEnterPortal: false,
    };
  }

  const parsed = SubscriptionRow.safeParse(data);
  if (!parsed.success)
    return {
      status: null,
      planId: null,
      periodEnd: null,
      freeYear: false,
      daysLeft: null,
      canEnterPortal: false,
    };
  const subscription = parsed.data;
  const expired = hasPeriodEnded(subscription.periodEnd, now.getTime());
  return {
    status: subscription.status === 'active' && expired ? 'past_due' : subscription.status,
    planId: subscription.planId,
    periodEnd: subscription.periodEnd,
    freeYear: isFreeYear(subscription),
    daysLeft: subscription.periodEnd === null ? null : dubaiDaysUntil(subscription.periodEnd, now),
    canEnterPortal: canUseSubscription(subscription, now.getTime()),
  };
}

export async function hasProfile(client: VisitorDbClient, userId: string): Promise<boolean> {
  const { data, error } = await client.from('profiles').select('id').eq('id', userId).maybeSingle();
  return error === null && data !== null;
}

/**
 * Where a signed-in visitor belongs. Used by sign-in, by the entry page and by
 * the email-link callback, so all three agree:
 *   no profile  -> /signup   (finish the entry flow: name and password)
 *   active      -> /portal
 *   otherwise   -> /billing  (the free year is over or was never set up)
 */
export async function routeForUser(
  client: VisitorDbClient,
  userId: string,
): Promise<'/signup' | '/portal' | '/billing' | '/mfa'> {
  try {
    if ((await readMfaState(client)).requiresVerification) return '/mfa';
  } catch {
    return '/mfa';
  }
  if (!(await hasProfile(client, userId))) return '/signup';
  const access = await accessForUser(client, userId);
  return access.canEnterPortal ? '/portal' : '/billing';
}
