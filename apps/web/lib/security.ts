import "server-only";
import { z } from "zod";
import { createHash } from "node:crypto";

/**
 * Spec Step 0: password ≥ 12 chars and refused when found in known
 * leaked-password lists. Breach check uses HaveIBeenPwned k-anonymity:
 * only the first 5 hash chars leave our server — never the password.
 */

export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(128, "Password is too long.");

export type BreachCheck = { breached: boolean; unavailable: boolean };

export async function checkPasswordBreach(
  password: string,
  timeoutMs = 4000
): Promise<BreachCheck> {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      { signal: ctrl.signal, headers: { "Add-Padding": "true" } }
    );
    if (!res.ok) return { breached: false, unavailable: true };
    const body = await res.text();
    const hit = body
      .split("\n")
      .some((line) => line.split(":")[0]?.trim() === suffix);
    return { breached: hit, unavailable: false };
  } catch {
    // Fail open: the breach list is defense-in-depth, not the primary gate
    // (length + Supabase auth + 2FA carry the weight). Availability wins.
    return { breached: false, unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Please enter your name.")
    .max(100, "Name is too long."),
  email: z.string().trim().toLowerCase().email("Please enter a valid email."),
  password: passwordSchema,
  planId: z.enum(["solo", "trio"]),
  terms: z.literal("on", {
    errorMap: () => ({ message: "Please accept the terms to continue." }),
  }),
});

export type SignupInput = z.infer<typeof signupSchema>;
