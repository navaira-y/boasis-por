"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { checkPasswordBreach } from "@/lib/security";
import { TERMS_VERSION, isKeyError } from "@/lib/domain";
import { activateSubscription, audit } from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";

export interface AuthState {
  ok: boolean;
  error?: string;
}

/**
 * Entry doors (Oct-3 flow): email in → waitlist message OR plans → password
 * → 6-digit code → straight into the portal. No payment step: the Solo
 * free-year activates inside signup; Trio/Enterprise open with the gateway.
 *  1. checkEntryAction   — email in, door out (waitlist | plans)
 *  2. sendCodeAction     — email in, code out (no session yet)
 *  3. verifyCodeAction   — code checked server-side, session + confirmed email
 *  4. completeEntryAction — password + profile + ACTIVE solo sub → /portal
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

const KEY_MSG =
  "Could not activate: the server key is misconfigured. The site owner needs to fix SUPABASE_SERVICE_ROLE_KEY.";

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

/**
 * Finalize: verified session + password → profile + ACTIVE Solo free-year in
 * one step. No pending state, no billing page — the session stays signed in
 * and the user lands straight in the portal. The door is re-derived
 * server-side (never trusted from the client). Activation is admin-only; when
 * the server key is dead the account (email + password + profile) still
 * exists and the user retries via sign-in → /billing/pending after the key
 * is fixed (a pending row is warmed for that path).
 */
export async function completeEntryAction(
  _prev: AuthState,
  formData: FormData
): Promise<AuthState> {
  const ip = await clientIp();
  if (!rateLimit(`entry-complete:${ip}`, 10, 60_000).ok) {
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
      console.error("completeEntry: password update failed", {
        userId: user.id,
        message: errMsg(pwError),
      });
      return fail("Could not set the password. Please try again.", pwError);
    }

    // Door re-derived server-side (client value never trusted).
    let entryBranch: "waitlist" | "plans" = "plans";
    try {
      const lookup = await createAdminSupabase();
      const { data } = await lookup
        .from("early_access_emails")
        .select("id")
        .eq("email", user.email.toLowerCase())
        .limit(1);
      if (data && data.length > 0) entryBranch = "waitlist";
    } catch (e) {
      console.error("completeEntry: waitlist lookup failed (non-blocking)", {
        userId: user.id,
        message: errMsg(e),
      });
    }

    // Profile: admin first, own-session fallback (RLS lets owners insert and
    // update their own row). A bad service key must not block signup — but a
    // failed admin write is logged LOUDLY so the key outage is never silent.
    const profileRow = {
      id: user.id,
      full_name: input.fullName,
      terms_version: TERMS_VERSION,
      terms_accepted_at: new Date().toISOString(),
      is_early_access: entryBranch === "waitlist",
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
      console.error("completeEntry: admin profile write failed, trying own session", {
        userId: user.id,
        message: errMsg(profileError),
      });
      const { error: ownError } = await supabase
        .from("profiles")
        .upsert(profileRow, { onConflict: "id" });
      if (ownError) {
        console.error("completeEntry: profile save failed (admin + own session)", {
          userId: user.id,
          adminMessage: errMsg(profileError),
          ownMessage: errMsg(ownError),
        });
        return fail("Account hit a problem saving your profile. Please try again.", ownError);
      }
    }

    // Claim the waitlist row (best-effort, loud): the account stays valid
    // even if the claim write fails; the email simply still looks listed.
    if (entryBranch === "waitlist") {
      try {
        const admin = await createAdminSupabase();
        const { error } = await admin
          .from("early_access_emails")
          .update({
            status: "claimed",
            claimed_by: user.id,
            claimed_at: new Date().toISOString(),
          })
          .eq("email", user.email.toLowerCase());
        if (error) {
          console.error("completeEntry: waitlist claim failed", {
            userId: user.id,
            message: errMsg(error),
          });
        }
      } catch (e) {
        console.error("completeEntry: waitlist claim failed", {
          userId: user.id,
          message: errMsg(e),
        });
      }
    }

    // Solo free-year, activated NOW (provider "free" — mirrors the billing
    // page activation so both paths produce identical subscriptions).
    try {
      const admin = await createAdminSupabase();
      const { data: sub, error: subReadError } = await admin
        .from("subscriptions")
        .select("id, status, activated_at")
        .eq("profile_id", user.id)
        .maybeSingle<{ id: string; status: string; activated_at: string | null }>();
      if (subReadError) throw subReadError;
      if (sub?.status !== "active") {
        if (sub && sub.status !== "pending" && sub.status !== "incomplete") {
          return { ok: false, error: "This subscription cannot be activated." };
        }
        if (sub?.activated_at) {
          return { ok: false, error: "The free year was already used on this account." };
        }
        let subId = sub?.id ?? null;
        if (!subId) {
          const { data: created, error: insError } = await admin
            .from("subscriptions")
            .insert({
              profile_id: user.id,
              status: "pending",
              provider: process.env.BILLING_PROVIDER ?? "stub",
            })
            .select("id")
            .single();
          if (insError) {
            if (isKeyError(insError)) throw insError;
            // 23505 race (double submit) → re-read.
            const { data: reread } = await admin
              .from("subscriptions")
              .select("id")
              .eq("profile_id", user.id)
              .maybeSingle<{ id: string }>();
            subId = reread?.id ?? null;
          } else {
            subId = created.id;
          }
        }
        if (!subId) throw new Error("subscription row missing");
        const { data: plan, error: planReadError } = await admin
          .from("plans")
          .select("free_months")
          .eq("id", "solo")
          .eq("active", true)
          .maybeSingle<{ free_months: number }>();
        if (planReadError) throw planReadError;
        if (!plan || plan.free_months <= 0) {
          return { ok: false, error: "The free year is not available right now." };
        }
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + plan.free_months);
        await activateSubscription(admin, {
          provider: "free",
          providerEventId: `free-year:${subId}`,
          profileId: user.id,
          subscriptionId: subId,
          planId: "solo",
          providerSubscriptionId: `free_${subId}`,
          periodStart: now.toISOString(),
          periodEnd: periodEnd.toISOString(),
        });
      }
    } catch (e) {
      if (isKeyError(e)) {
        console.error("completeEntry: service key misconfigured — account saved, activation pending key fix");
        // Warm the retry path: own pending row (migration 0005) so sign-in →
        // /billing/pending self-heals after the key is fixed.
        try {
          await supabase.from("subscriptions").insert({
            profile_id: user.id,
            status: "pending",
            provider: process.env.BILLING_PROVIDER ?? "stub",
          });
        } catch {
          // Row already there (23505) or RLS — the billing page self-heals.
        }
        return { ok: false, error: KEY_MSG };
      }
      throw e;
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
        meta: { terms: TERMS_VERSION, branch: entryBranch },
      });
    } catch {
      console.error("completeEntry: audit skipped (admin unavailable)");
    }
  } catch (e) {
    return fail("Could not create the account. Please try again.", e);
  }

  // Session stays signed in (verified + active) → straight into the portal.
  redirect("/portal");
}

/**
 * Entry branch (Oct-3 flow): early-access email → waitlist door, else plans
 * door. The membership check is server-side (service key) + rate-limited; the
 * OTP step still guards account creation, so learning that an address is
 * listed grants nothing by itself.
 */
export async function checkEntryAction(
  emailRaw: string
): Promise<{ ok: boolean; branch?: "waitlist" | "plans"; error?: string }> {
  const parsed = emailSchema.safeParse(emailRaw);
  if (!parsed.success) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  const email = parsed.data;
  const ip = await clientIp();
  if (
    !rateLimit(`entry:${email}`, 10, 3_600_000).ok ||
    !rateLimit(`entry-ip:${ip}`, 30, 3_600_000).ok
  ) {
    return { ok: false, error: "Too many attempts. Please wait a while and try again." };
  }
  try {
    const admin = await createAdminSupabase();
    const { data, error } = await admin
      .from("early_access_emails")
      .select("id")
      .eq("email", email)
      .limit(1);
    if (error) {
      console.error("checkEntry: lookup failed", { message: errMsg(error) });
      return { ok: false, error: "Could not check that email. Please try again." };
    }
    return { ok: true, branch: data && data.length > 0 ? "waitlist" : "plans" };
  } catch (e) {
    return fail("Could not check that email. Please try again.", e);
  }
}
