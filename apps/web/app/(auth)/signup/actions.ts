"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { checkPasswordBreach } from "@/lib/security";
import { TERMS_VERSION } from "@/lib/domain";
import { audit } from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";

export interface AuthState {
  ok: boolean;
  error?: string;
}

/**
 * Inline 6-digit email verification (Supabase OTP):
 *  1. sendCodeAction   — email in, code out (no session yet)
 *  2. verifyCodeAction — code checked server-side, session + confirmed email
 *  3. completeSignupAction — password + terms → profile + pending sub
 *     (plan is chosen on the payment step, nothing preselected)
 * Every failure returns an inline message (never a crash page). Raw detail is
 * appended in development only, so real causes stay debuggable.
 */
function errMsg(detail: unknown): string {
  if (detail instanceof Error) return detail.message;
  if (
    typeof detail === "object" &&
    detail !== null &&
    "message" in detail &&
    typeof (detail as { message: unknown }).message === "string"
  ) {
    return (detail as { message: string }).message;
  }
  return String(detail ?? "");
}

function fail(friendly: string, detail: unknown): AuthState {
  const raw = errMsg(detail);
  const extra =
    process.env.NODE_ENV !== "production" && raw ? ` (tech: ${raw})` : "";
  return { ok: false, error: `${friendly}${extra}` };
}

const emailSchema = z.string().trim().toLowerCase().email();
const codeSchema = z.string().trim().regex(/^\d{6}$/);

async function clientIp(): Promise<string> {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Step 1: send the 6-digit code. Reveals nothing about account existence. */
export async function sendCodeAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  try {
    const email = emailSchema.parse(formData.get("email"));
    const ip = await clientIp();
    if (!rateLimit(`otp-send:${email}`, 5, 3_600_000).ok) {
      return { ok: false, error: "Too many codes sent to this email. Please wait an hour and try again." };
    }
    if (!rateLimit(`otp-send-ip:${ip}`, 20, 3_600_000).ok) {
      return { ok: false, error: "Too many attempts. Please wait a while and try again." };
    }

    const supabase = await createServerSupabase();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        // Link-clickers get a real app session, then resume signup (code no
        // longer required). Without this the link dumps them on the homepage.
        emailRedirectTo: `${appUrl}/auth/callback?next=/signup`,
      },
    });
    if (error) {
      if (error.message.toLowerCase().includes("rate limit")) {
        return { ok: false, error: "Too many codes sent. Please wait a few minutes and try again." };
      }
      return fail("Could not send the code. Please try again.", error);
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: "Please enter a valid email address." };
    }
    return fail("Could not send the code. Please try again.", e);
  }
}

/** Step 2: check the code. Correct code = verified email + signed-in session. */
export async function verifyCodeAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  try {
    const email = emailSchema.parse(formData.get("email"));
    const code = codeSchema.parse(formData.get("code"));
    const ip = await clientIp();
    if (!rateLimit(`otp-verify:${email}:${ip}`, 10, 600_000).ok) {
      return { ok: false, error: "Too many wrong tries. Please wait 10 minutes, then send a new code." };
    }

    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (error) {
      return fail(
        "That code is not correct or it expired. Check the email and try again.",
        error
      );
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { ok: false, error: "Please enter the 6-digit code." };
    }
    return fail("Could not check the code. Please try again.", e);
  }
}

const completeSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your account name.").max(100),
  password: z.string().min(12, "Password must be at least 12 characters.").max(128),
  terms: z.literal("on", { errorMap: () => ({ message: "Please accept the terms to continue." }) }),
});

/** Step 3: verified session → password + profile + PENDING subscription (no plan yet). */
export async function completeSignupAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const ip = await clientIp();
  if (!rateLimit(`signup:${ip}`, 10, 60_000).ok) {
    return { ok: false, error: "Too many attempts. Please wait a minute and try again." };
  }

  const parsed = completeSchema.safeParse({
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    terms: formData.get("terms"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const input = parsed.data;

  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // The code step cannot be skipped: no verified session, no account.
    if (!user?.email || !user.email_confirmed_at) {
      return { ok: false, error: "Please verify your email code first." };
    }

    const breach = await checkPasswordBreach(input.password);
    if (breach.breached) {
      return { ok: false, error: "This password was found in a known data leak. Please choose a different one." };
    }

    const { error: pwError } = await supabase.auth.updateUser({
      password: input.password,
      data: { full_name: input.fullName },
    });
    if (pwError) {
      // Server logs only — never shown to the user.
      console.error("completeSignup: password update failed", {
        userId: user.id,
        message: errMsg(pwError),
      });
      return fail("Could not set the password. Please try again.", pwError);
    }

    // Profile: admin first, own-session fallback (RLS lets owners insert and
    // update their own row). A bad service key must not block signup — but a
    // failed admin write is logged LOUDLY so the key outage is never silent.
    const profileRow = {
      id: user.id,
      full_name: input.fullName,
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
    };
    let profileError: unknown = null;
    try {
      const admin = await createAdminSupabase();
      const { error } = await admin
        .from("profiles")
        .upsert(profileRow, { onConflict: "id" });
      profileError = error;
    } catch (e) {
      profileError = e;
    }
    if (profileError) {
      console.error("completeSignup: admin profile write failed, trying own session", {
        userId: user.id,
        message: errMsg(profileError),
      });
      const { error: ownError } = await supabase
        .from("profiles")
        .upsert(profileRow, { onConflict: "id" });
      if (ownError) {
        console.error("completeSignup: profile save failed (admin + own session)", {
          userId: user.id,
          adminMessage: errMsg(profileError),
          ownMessage: errMsg(ownError),
        });
        return fail("Account hit a problem saving your profile. Please try again.", ownError);
      }
    }

    // Subscription: same fallback (migration 0005 lets owners insert their
    // OWN pending row; activation stays server-only, so the pay gate holds).
    // Plain insert on the fallback (no update grant) — 23505 means the row is
    // already there, which is success.
    const subRow = {
      profile_id: user.id,
      status: "pending",
      provider: process.env.BILLING_PROVIDER ?? "stub",
    };
    let subError: unknown = null;
    try {
      const admin = await createAdminSupabase();
      const { error } = await admin
        .from("subscriptions")
        .upsert(subRow, { onConflict: "profile_id", ignoreDuplicates: true });
      subError = error;
    } catch (e) {
      subError = e;
    }
    if (subError) {
      console.error("completeSignup: admin subscription write failed, trying own session", {
        userId: user.id,
        message: errMsg(subError),
      });
      const { error: ownError } = await supabase.from("subscriptions").insert(subRow);
      const alreadyThere =
        (ownError as { code?: string } | null)?.code === "23505";
      if (ownError && !alreadyThere) {
        console.error("completeSignup: subscription save failed (admin + own session)", {
          userId: user.id,
          adminMessage: errMsg(subError),
          ownMessage: errMsg(ownError),
        });
        return fail("Account hit a problem setting up billing. Please try again.", ownError);
      }
    }

    // Best-effort audit: never blocks signup (the helper also swallows
    // insert failures internally; this guards admin creation too).
    try {
      const auditAdmin = await createAdminSupabase();
      await audit(auditAdmin, {
        actor_profile_id: user.id,
        action: "account.created",
        entity: "profile",
        entity_id: user.id,
        meta: { terms: TERMS_VERSION },
      });
    } catch {
      console.error("completeSignup: audit skipped (admin unavailable)");
    }

    // Standard flow: account created → sign out → sign in with the new
    // password. (If sign-out ever fails silently, /signin routes logged-in
    // users correctly anyway, so this degrades gracefully.)
    await supabase.auth.signOut();
  } catch (e) {
    return fail("Could not create the account. Please try again.", e);
  }

  redirect("/signin?next=/billing/pending");
}
