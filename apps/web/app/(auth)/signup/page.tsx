import Link from "next/link";
import { isPlanId, listPlans } from "@/lib/plans";
import { SignupForm } from "./form";

/** Spec Step 0: full account first, plan picked here (?plan=solo|trio preselects). */
export const dynamic = "force-dynamic";
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const plans = await listPlans();
  const preselected = isPlanId(params.plan) ? params.plan : "solo";
  const next = params.next ?? "/billing/pending";

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">BOASIS PORTAL · STEP 0 — CREATE YOUR ACCOUNT</p>
        <h1>Create your account</h1>
        <p className="muted">
          Your account keeps your company file private to you and the people
          you invite.
        </p>
        <ol className="steps">
          <li className="done">1. Account</li>
          <li>2. Verify email</li>
          <li>3. Payment</li>
          <li>4. Onboarding</li>
        </ol>
        {params.error === "link-expired" && (
          <div className="error">
            That verification link expired. Please sign in again to get a new one.
          </div>
        )}
        <SignupForm plans={plans} preselected={preselected} next={next} />
        <p className="small muted" style={{ marginTop: 16 }}>
          Two-step sign-in with an authenticator app can be turned on later in
          settings. <Link href="/">Back to plans</Link>
        </p>
      </div>
    </main>
  );
}
