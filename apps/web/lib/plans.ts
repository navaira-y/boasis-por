import { createServerSupabase } from "@/lib/supabase";
import type { PlanId } from "@/lib/domain";

export interface Plan {
  id: PlanId;
  name: string;
  max_companies: number;
  price_fils: number;
  currency: string;
}

/** Plans are public data (anon-readable). DB is the single source of truth. */
export async function listPlans(): Promise<Plan[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("plans")
    .select("id,name,max_companies,price_fils,currency")
    .eq("active", true)
    .order("price_fils");
  if (error) throw new Error("Could not load plans. Please try again.");
  return (data ?? []) as Plan[];
}

export function isPlanId(value: unknown): value is PlanId {
  return value === "solo" || value === "trio";
}
