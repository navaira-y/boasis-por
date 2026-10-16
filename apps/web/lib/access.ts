import 'server-only';
import type { VisitorDbClient } from './supabase';
import type { SubscriptionStatus } from './gate';
import { daysUntil } from './renewals';

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
    .select('status,plan_id,provider,current_period_end')
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

  const row = data as Record<string, unknown>;
  const status = (typeof row.status === 'string' ? row.status : null) as SubscriptionStatus | null;
  const periodEnd = typeof row.current_period_end === 'string' ? row.current_period_end : null;
  const provider = typeof row.provider === 'string' ? row.provider : null;
  const daysLeft =
    periodEnd === null ? null : daysUntil(new Date(periodEnd), now);

  return {
    status,
    planId: typeof row.plan_id === 'string' ? row.plan_id : null,
    periodEnd,
    freeYear: status === 'active' && provider === 'free',
    daysLeft,
    canEnterPortal: status === 'active',
  };
}

export async function hasProfile(client: VisitorDbClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
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
): Promise<'/signup' | '/portal' | '/billing'> {
  if (!(await hasProfile(client, userId))) return '/signup';
  const access = await accessForUser(client, userId);
  return access.canEnterPortal ? '/portal' : '/billing';
}
