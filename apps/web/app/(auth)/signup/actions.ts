"use server";

import { redirect } from "next/navigation";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { checkPasswordBreach, signupSchema } from "@/lib/security";
import { TERMS_VERSION } from "@/lib/domain";
import { audit } from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";
import { headers } from "next/headers";

export interface SignupState {
  ok: boolean;
  error?: string;
}

/**
 * Spec Step 0: creates auth user + profile + PENDING subscription.
 * The account cannot touch the portal until email is verified AND
 * a billing webhook flips it active.
 */
export async function signupAction(
  _prev: SignupState,
  formData: FormData
): Promise<SignupState> {
  const ip = (await headers()).get("x-forwarded-for") ?? "unknown";
  const rl = rateLimit(`signup:${ip}`, 10, 60_000);
  if (!rl.ok) return { ok: false, error: "Too many attempts. Please wait a minute and try again." };

  const parsed = signupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    planId: formData.get("planId"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const input = parsed.data;
  const next = String(formData.get("next") ?? "/billing/pending");

  const breach = await checkPasswordBreach(input.password);
  if (breach.breached) {
    return {
      ok: false,
      error: "This password was found in a known data leak. Please choose a different one.",
    };
  }

  const supabase = await createServerSupabase();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: { full_name: input.fullName },
      emailRedirectTo: `${appUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    // Keep messages generic where they could leak account existence.
    return { ok: false, error: "Could not create the account. Please try again." };
  }

  // signUp succeeds without a session until the email link is clicked.
  // data.user is still present, so we can attach profile + subscription now.
  const userId = data.user?.id;
  if (!userId) redirect("/verify-email");

  const admin = await createAdminSupabase();

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      full_name: input.fullName,
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profileError) {
    return { ok: false, error: "Account created but profile failed. Please contact support." };
  }

  const { error: subError } = await admin.from("subscriptions").upsert(
    {
      profile_id: userId,
      plan_id: input.planId,
      status: "pending",
      provider: process.env.BILLING_PROVIDER ?? "stub",
    },
    { onConflict: "profile_id", ignoreDuplicates: true }
  );
  if (subError) {
    return { ok: false, error: "Account created but billing setup failed. Please contact support." };
  }

  await audit(admin, {
    actor_profile_id: userId,
    action: "account.created",
    entity: "profile",
    entity_id: userId,
    meta: { plan: input.planId, terms: TERMS_VERSION },
  });

  redirect("/verify-email");
}
