"use client";

import { useActionState, useState } from "react";
import { signupAction, type SignupState } from "./actions";
import { formatAED, type PlanId } from "@/lib/domain";
import type { Plan } from "@/lib/plans";

const initialState: SignupState = { ok: false };

export function SignupForm({
  plans,
  preselected,
  next,
}: {
  plans: Plan[];
  preselected: PlanId;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(signupAction, initialState);
  const [plan, setPlan] = useState<PlanId>(preselected);

  return (
    <form action={formAction}>
      <input type="hidden" name="next" value={next} />
      {!state.ok && state.error && <div className="error">{state.error}</div>}

      <div className="field">
        <label htmlFor="fullName">Full name</label>
        <input id="fullName" name="fullName" type="text" required minLength={2} maxLength={100} autoComplete="name" />
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
        <p className="small muted">Sign-in and all reminders go here.</p>
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required minLength={12} autoComplete="new-password" />
        <p className="small muted">At least 12 characters. We refuse passwords found in known leaks.</p>
      </div>

      <div className="field">
        <label>Plan — sets how many companies you can add</label>
        <div className="plans">
          {plans.map((p) => (
            <label key={p.id} className={`plan ${plan === p.id ? "selected" : ""}`}>
              <input
                type="radio"
                name="planId"
                value={p.id}
                checked={plan === p.id}
                onChange={() => setPlan(p.id)}
              />
              <h3>{p.id === "solo" ? "Solo" : "Trio"}</h3>
              <div className="price">
                {formatAED(p.price_fils, p.currency)}
                <span className="muted small"> /month</span>
              </div>
              <p className="muted small">
                {p.max_companies === 1 ? "1 company" : `Up to ${p.max_companies} companies`}
              </p>
            </label>
          ))}
        </div>
      </div>

      <label className="check">
        <input type="checkbox" name="terms" value="on" required />
        <span className="small">
          I accept the Terms and Privacy Policy. Required.
        </span>
      </label>

      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Create account & continue to payment"}
      </button>
      <p className="small muted" style={{ marginTop: 12 }}>
        Next: verify your email, then payment. Onboarding unlocks after payment.
      </p>
    </form>
  );
}
