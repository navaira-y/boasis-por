import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { SigninForm } from "./form";

/** Returning users: paid accounts land in the portal, unpaid in payment. */
export const dynamic = "force-dynamic";

export default async function SigninPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const admin = await createAdminSupabase();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("status")
      .eq("profile_id", user.id)
      .maybeSingle<{ status: string }>();
    redirect(sub?.status === "active" ? "/onboarding" : "/billing/pending");
  }

  return (
    <main className="wrap">
      <div className="card">
        <p className="eyebrow">Boasis portal · Sign in</p>
        <h1>Welcome back.</h1>
        <p className="muted">
          Sign in to your portal. Unpaid accounts continue to payment.
        </p>
        <SigninForm />
      </div>
    </main>
  );
}
