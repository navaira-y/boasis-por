import { createServerSupabase } from "@/lib/supabase";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Already verified (e.g. clicked the link in this browser) → move on.
  if (user?.email_confirmed_at) redirect("/billing/pending");

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">BOASIS PORTAL · STEP 0 — VERIFY EMAIL</p>
        <h1>Check your inbox</h1>
        <ol className="steps">
          <li className="done">1. Account</li>
          <li className="done">2. Verify email</li>
          <li>3. Payment</li>
          <li>4. Onboarding</li>
        </ol>
        <p>
          We sent a verification link to{" "}
          <strong>{user?.email ?? "your email address"}</strong>. Click it to
          continue to payment.
        </p>
        <p className="muted small">
          Step 1 of onboarding only opens after your email is verified — this
          is where every reminder will go, so we confirm it first.
        </p>
      </div>
    </main>
  );
}
