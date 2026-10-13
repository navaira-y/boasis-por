import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { listPlans, type Plan } from "@/lib/plans";
import { SignupForm } from "./form";

/**
 * Entry doors: email → waitlist message OR plans → password → code → portal.
 * No payment step (Solo free-year activates inside signup).
 */
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // Resume: verified session but no profile yet (abandoned halfway, or clicked
  // the email link instead of typing the code) → the form skips to password.
  // Own-session reads (RLS owner-read): no service key needed on this path.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let resumeEmail: string | null = null;
  if (user?.email) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    // Account already exists (signed in already): /signin routes logged-in
    // users correctly (paid → portal, unpaid → payment).
    if (profile) redirect("/signin");
    if (user.email_confirmed_at) resumeEmail = user.email;
  }

  // Plans for the plans door (public marketing data). A failure must not kill
  // the page — the form shows a reload hint instead.
  let plans: Plan[] = [];
  try {
    plans = await listPlans();
  } catch {
    plans = [];
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">Boasis portal · Create your account</p>
        <h1>Create your account</h1>
        <p className="muted">
          One login for your portal. No payment today — the Solo free year
          starts the moment your account is ready.
        </p>
        <SignupForm plans={plans} resumeEmail={resumeEmail} />
        <p className="small muted" style={{ marginTop: 16 }}>
          Two-step sign-in with an authenticator app can be turned on later in
          settings. <Link href="/">Back to plans</Link>
        </p>
        <p className="small muted" style={{ marginTop: 8 }}>
          Already have an account? <Link href="/signin">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
