import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { SignupForm } from "./form";

/** Step 1 of 2: account with inline email-code check. Plan picked at payment. */
export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ?? "/billing/pending";

  // Resume: verified session but no profile yet (abandoned halfway, or clicked
  // the email link instead of typing the code) → skip straight to details.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let resumeEmail: string | null = null;
  if (user?.email) {
    const admin = await createAdminSupabase();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile) redirect("/billing/pending");
    if (user.email_confirmed_at) resumeEmail = user.email;
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="muted small">BOASIS PORTAL · STEP 1 OF 2 — YOUR ACCOUNT</p>
        <h1>Create your account</h1>
        <p className="muted">
          Your account keeps your company file private to you and the people
          you invite.
        </p>
        <ol className="steps">
          <li className="done">1. Account</li>
          <li>2. Payment</li>
        </ol>
        <SignupForm next={next} resumeEmail={resumeEmail} />
        <p className="small muted" style={{ marginTop: 16 }}>
          Two-step sign-in with an authenticator app can be turned on later in
          settings. <Link href="/">Back to plans</Link>
        </p>
      </div>
    </main>
  );
}
