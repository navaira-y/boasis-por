import { BillingPlanRow } from '@boasis/schema';
import 'server-only';
import { serverSupabase } from './supabase';
import { PLAN_FALLBACK, type Plan, type PlanId } from './plans';
import { asRows } from './shape';

/**
 * Reads the plans from the database (the source of truth) with the visitor's
 * own session: `plans` is public read, so no service key is needed and the
 * door cannot be broken by a key problem. A database hiccup falls back to the
 * display copy in plans.ts, which mirrors migration 0002.
 */

export interface PlansResult {
  plans: Plan[];
  source: 'database' | 'fallback';
}

const ORDER: PlanId[] = ['solo', 'trio', 'enterprise'];

export async function listPlans(): Promise<PlansResult> {
  try {
    const supabase = await serverSupabase();
    const { data, error } = await supabase
      .from('plans')
      .select('id,name,max_companies,price_fils,free_months,currency')
      .eq('active', true);
    if (error !== null || asRows(data).length === 0) {
      console.warn(`plans: falling back to display copy (${error?.message ?? 'no rows'})`);
      return { plans: [...PLAN_FALLBACK], source: 'fallback' };
    }
    const plans = BillingPlanRow.array().parse(data);
    plans.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
    return { plans, source: 'database' };
  } catch (error) {
    console.warn(
      `plans: falling back to display copy (${error instanceof Error ? error.message : 'unknown'})`,
    );
    return { plans: [...PLAN_FALLBACK], source: 'fallback' };
  }
}
