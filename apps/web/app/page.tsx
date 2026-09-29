import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase";
import { formatAED } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createServerSupabase();
  const { data: plans } = await supabase
    .from("plans")
    .select("id,name,max_companies,price_fils,currency")
    .eq("active", true)
    .order("price_fils");

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">BOASIS PORTAL · MANAGE</p>
        <h1>Every date, rule and step for your UAE companies.</h1>
        <p className="muted">
          Your company file, email reminders to the right person, plain
          step-by-step guidance for your free zone, and a vault for every
          document.
        </p>
        <div className="plans">
          {(plans ?? []).map((p) => (
            <div className="plan" key={p.id}>
              <h3>{p.name}</h3>
              <div className="price">
                {formatAED(p.price_fils, p.currency)}
                <span className="muted small"> /month</span>
              </div>
              <p className="muted small">
                {p.max_companies === 1
                  ? "1 company file, reminders, guidance, vault."
                  : `Up to ${p.max_companies} companies, one combined year, reminders, vault.`}
              </p>
              <Link className="btn secondary" href={`/signup?plan=${p.id}`}>
                Choose {p.id === "solo" ? "Solo" : "Trio"}
              </Link>
            </div>
          ))}
        </div>
        <p className="small muted">
          Already have an account? <Link href="/signup">Sign up</Link> creates
          a new one — sign-in arrives with the portal dashboard in Phase 2.
        </p>
      </div>
    </main>
  );
}
