"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createAdminSupabase, createServerSupabase } from "@/lib/supabase";
import { rateLimit } from "@/lib/ratelimit";

export interface SigninState {
  ok: boolean;
  error?: string;
}

const signinSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/**
 * Returning users: password sign-in, then paid → portal, unpaid → payment
 * (which self-heals a missing row). Failures stay inline, never a crash page.
 */
export async function signinAction(
  _prev: SigninState,
  formData: FormData
): Promise<SigninState> {
  const parsed = signinSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter your email and password." };
  }
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`signin:${parsed.data.email}:${ip}`, 10, 600_000).ok) {
    return { ok: false, error: "Too many tries. Wait 10 minutes and try again." };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    return { ok: false, error: "That email or password is not correct." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Could not sign you in. Please try again." };
  }
  const admin = await createAdminSupabase();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("status")
    .eq("profile_id", user.id)
    .maybeSingle<{ status: string }>();

  redirect(sub?.status === "active" ? "/onboarding" : "/billing/pending");
}
