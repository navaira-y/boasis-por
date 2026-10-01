import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase";
import { formatAED } from "@/lib/domain";

export const dynamic = "force-dynamic";

function planBlurb(p: {
  id: string;
  max_companies: number | null;
  price_fils: number | null;
  free_months: number;
  currency: string;
}): { price: string; sub: string; detail: string } {
  if (p.price_fils === null) {
    return {
      price: "Custom",
      sub: "",
      detail: "Unlimited companies. Talk to us and we tailor it.",
    };
  }
  const companies =
    p.max_companies === 1 ? "1 company" : `Up to ${p.max_companies} companies`;
  if (p.free_months > 0) {
    return {
      price: `Free for ${p.free_months} months`,
      sub: ` then ${formatAED(p.price_fils, p.currency)}/month`,
      detail: `${companies}: file, reminders, guidance, vault.`,
    };
  }
  return {
    price: formatAED(p.price_fils, p.currency),
    sub: " /month",
    detail: `${companies}: one combined year, reminders, vault.`,
  };
}

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: plans } = await supabase
    .from("plans")
    .select("id,name,max_companies,price_fils,free_months,currency")
    .eq("active", true)
    .order("price_fils", { ascending: true, nullsFirst: false });

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">Boasis portal · Manage</p>
        <h1>Every date, rule and step for your UAE companies.</h1>
        <p className="muted">
          Your company file, email reminders to the right person, plain
          step-by-step guidance for your free zone, and a vault for every
          document.
        </p>
        <div className="plans three">
          {(plans ?? []).map((p) => {
            const b = planBlurb(p);
            return (
              <div className="plan" key={p.id}>
                <h3>{p.name}</h3>
                <div className="price">
                  {b.price}
                  <span className="muted small">{b.sub}</span>
                </div>
                <p className="muted small">{b.detail}</p>
                <Link className="btn secondary" href="/signup">
                  Get started
                </Link>
              </div>
            );
          })}
        </div>
        <p className="small muted">
          You choose your plan after signup — nothing is preselected.
        </p>
      </div>
    </main>
  );
}
