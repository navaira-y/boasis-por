"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CheckoutButton() {
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
    <div>
      {error && <div className="error">{error}</div>}
      <button className="btn" onClick={startCheckout} disabled={loading}>
        {loading ? "Opening secure checkout…" : "Continue to secure checkout"}
      </button>
    </div>
  );
}
