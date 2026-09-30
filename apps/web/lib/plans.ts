import { createServerSupabase } from "@/lib/supabase";
import type { PlanId } from "@/lib/domain";

export interface Plan {
  id: PlanId;
  name: string;
  max_companies: number | null; // null = unlimited (enterprise)
  price_fils: number | null; // null = custom pricing (enterprise)
  free_months: number; // free period before first charge (solo = 12)
  currency: string;
}

/** Plans are public data (anon-readable). DB is the single source of truth. */
export async function listPlans(): Promise<Plan[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("plans")
    .select("id,name,max_companies,price_fils,free_months,currency")
    .eq("active", true)
    .order("price_fils", { ascending: true, nullsFirst: false });
  if (error) throw new Error("Could not load plans. Please try again.");
  return (data ?? []) as Plan[];
}

export function isPlanId(value: unknown): value is PlanId {
  return value === "solo" || value === "trio" || value === "enterprise";
}
