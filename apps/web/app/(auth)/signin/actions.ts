'use server';

import { headers } from 'next/headers';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { serverSupabase } from '@/lib/supabase';
import { routeForUser } from '@/lib/access';
import { logEntryEvent } from '@/lib/log';

/**
 * Sign-in is for RETURNING visits. The door itself (signup) is unchanged, and
 * a wrong password answers exactly like an unknown address: no way to find out
 * which addresses have accounts.
 */

export interface SignInResponse {
  ok: boolean;
  error?: string;
  next?: string;
}

export async function signInAction(emailRaw: string, password: string): Promise<SignInResponse> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email) || password.length === 0) {
    return { ok: false, error: 'Please enter your email and password.' };
  }
  const perIp = checkLimit('signInIp', clientIp(await headers()));
  if (!perIp.ok) {
    const minutes = Math.max(1, Math.ceil(perIp.retryAfterSeconds / 60));
    return { ok: false, error: `Too many attempts. Please wait about ${String(minutes)} minute(s).` };
  }

  const supabase = await serverSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error !== null) {
    await logEntryEvent({ kind: 'signin', email, code: 'FAILED' });
    return { ok: false, error: 'That email and password do not match. Please try again.' };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return { ok: false, error: 'Could not sign you in. Please try again.' };
  await logEntryEvent({ kind: 'signin', email, code: 'OK' });
  return { ok: true, next: await routeForUser(supabase, user.id) };
}

/** Same check the entry flow uses, for the code path on the sign-in screen. */
export async function verifySignInCodeAction(
  emailRaw: string,
  code: string,
): Promise<SignInResponse> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { ok: false, error: 'Please enter a valid email address.' };
  if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: 'Please enter the 6-digit code.' };
  const perIp = checkLimit('otpVerify', clientIp(await headers()));
  if (!perIp.ok) return { ok: false, error: 'Too many tries. Please wait ten minutes.' };

  const supabase = await serverSupabase();
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error !== null) return { ok: false, error: 'That code is not right, or it has expired.' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return { ok: false, error: 'Could not sign you in. Please try again.' };
  await logEntryEvent({ kind: 'signin', email, code: 'CODE' });
  return { ok: true, next: await routeForUser(supabase, user.id) };
}
