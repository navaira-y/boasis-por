import 'server-only';
import {
  BILLING_PLAN_COLUMNS,
  SUBSCRIPTION_COLUMNS,
  BillingPlanRow,
  SubscriptionRow,
  type BillingSnapshot,
} from '@boasis/schema';
import type { VisitorDbClient } from './supabase';

// Own-cookie client only. RLS is authoritative; errors never become a fictitious Solo row.
export async function billingForUser(
  client: VisitorDbClient,
  userId: string,
): Promise<BillingSnapshot> {
  const [subscription, plans] = await Promise.all([
    client
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('profile_id', userId)
      .maybeSingle(),
    client.from('plans').select(BILLING_PLAN_COLUMNS).eq('active', true),
  ]);
  if (subscription.error !== null || plans.error !== null)
    throw new Error('Subscription lookup failed');
  return {
    subscription: subscription.data === null ? null : SubscriptionRow.parse(subscription.data),
    plans: BillingPlanRow.array().parse(plans.data),
  };
}
