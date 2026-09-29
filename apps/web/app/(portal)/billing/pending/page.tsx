"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BillingPendingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Checkout failed.");
      router.push(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed.");
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">BOASIS PORTAL · PAYMENT</p>
        <h1>Activate your account</h1>
        <ol className="steps">
          <li className="done">1. Account</li>
          <li className="done">2. Verify email</li>
          <li className="done">3. Payment</li>
          <li>4. Onboarding</li>
        </ol>
        <p className="muted">
          Your account is created and your email is verified. One payment
          activates everything — onboarding unlocks immediately after.
        </p>
        {error && <div className="error">{error}</div>}
        <button className="btn" onClick={startCheckout} disabled={loading}>
          {loading ? "Opening secure checkout…" : "Continue to secure checkout"}
        </button>
      </div>
    </main>
  );
}
