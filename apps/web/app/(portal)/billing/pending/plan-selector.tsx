"use client";

import { useState } from "react";
import { formatAED, type PlanId } from "@/lib/domain";
import type { Plan } from "@/lib/plans";
import { activateFreeYearAction } from "./actions";
import { CheckoutButton } from "./checkout-button";
import { useActionState } from "react";

const idle = { ok: false as const, error: undefined as string | undefined };

function priceLine(p: Plan): { main: string; sub: string } {
  if (p.price_fils === null) return { main: "Custom", sub: "" };
  if (p.free_months > 0) {
    return {
      main: `Free for ${p.free_months} months`,
      sub: ` then ${formatAED(p.price_fils, p.currency)}/month`,
    };
  }
  return { main: formatAED(p.price_fils, p.currency), sub: " /month" };
}

function companiesLine(p: Plan): string {
  if (p.max_companies === null) return "Unlimited companies";
  return p.max_companies === 1 ? "1 company" : `Up to ${p.max_companies} companies`;
}

/**
 * Plan cards. Signup mode: nothing preselected, Solo = free-year activation.
 * Renewal mode: current plan preselected, everything paid (no free copy).
 */
export function PlanSelector({
  plans,
  mode,
  currentPlan,
}: {
  plans: Plan[];
  mode: "signup" | "renewal";
  currentPlan: PlanId | null;
}) {
  const shown =
    mode === "renewal" ? plans.map((p) => ({ ...p, free_months: 0 })) : plans;
  const [selected, setSelected] = useState<PlanId | null>(
    mode === "renewal" && (currentPlan === "solo" || currentPlan === "trio")
      ? currentPlan
      : null
  );
  const [freeState, freeAction, freePending] = useActionState(
    activateFreeYearAction,
    idle
  );
  const plan = shown.find((p) => p.id === selected) ?? null;

  return (
    <div>
      <div className="plans three" role="radiogroup" aria-label="Choose a plan">
        {shown.map((p) => {
          const price = priceLine(p);
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(p.id)}
              className={`plan ${isSelected ? "selected" : ""}`}
            >
              <h3>{p.name}</h3>
              <div className="price">
                {price.main}
                <span className="muted small">{price.sub}</span>
              </div>
              <p className="muted small">{companiesLine(p)}</p>
            </button>
          );
        })}
      </div>

      {!plan && mode === "signup" && (
        <p className="small muted">Select a plan above to continue. (Required)</p>
      )}

      {plan?.id === "solo" && mode === "signup" && (
        <form action={freeAction}>
          {!freeState.ok && freeState.error && (
            <div className="error">{freeState.error}</div>
          )}
          <button className="btn" type="submit" disabled={freePending}>
            {freePending ? "Activating…" : "Activate my free year"}
          </button>
          <p className="small muted" style={{ marginTop: 10 }}>
            No payment today. After 12 months it continues at AED 30/month —
            we&apos;ll remind you before anything is charged.
          </p>
        </form>
      )}

      {plan?.id === "solo" && mode === "renewal" && (
        <div>
          <CheckoutButton planId="solo" />
          <p className="small muted" style={{ marginTop: 10 }}>
            Year 2 and after: AED 30/month. Access unlocks right after payment.
          </p>
        </div>
      )}

      {plan?.id === "trio" && <CheckoutButton planId="trio" />}

      {plan?.id === "enterprise" && (
        <div className="notice">
          <strong>Enterprise is tailored.</strong> Tell us how many companies
          and people you run, and we&apos;ll set up your billing.{" "}
          <a href="https://boasis.ae/contact.html" target="_blank" rel="noreferrer">
            Contact us →
          </a>
        </div>
      )}
    </div>
  );
}
