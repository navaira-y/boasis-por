'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import { checkEntry } from '@/lib/entry';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { checkPasswordBreach, passwordProblem } from '@/lib/password';
import { adminSupabaseOrNull, serverSupabase } from '@/lib/supabase';
import { appUrl } from '@/lib/env';
import { accessForUser, hasProfile } from '@/lib/access';
import { auditEvent, logEntryEvent } from '@/lib/log';
import { asRecord, asRows, asText } from '@/lib/shape';
import { authFailure } from '@/lib/auth-error';
import { activateFreeYearForCurrentUser } from '@/lib/activation';
import { TERMS_VERSION } from '@/lib/copy';
import type { PlanId } from '@/lib/plans';

/**
 * The entry flow, server side. Nothing here trusts the browser:
 * the door is re-derived from the database, activation is written by Postgres
 * (or by the service role when the database function is not there yet), and
 * every rate limit and every check runs on this side.
 *
 * Order matters and follows the spec: early-access check -> password and
 * terms -> inbox CODE -> only then does the account exist -> Solo free year
 * active -> /portal with the session intact.
 */

export interface EntryCheckResponse {
  ok: boolean;
  branch?: 'waitlist' | 'plans';
  listed?: boolean | null;
  problem?: {
    code: string;
    title: string;
    fix: string;
    continueAllowed: boolean;
  };
  error?: string;
}

export interface SimpleResponse {
  ok: boolean;
  error?: string;
  /** Where the visitor goes next, when the action did not redirect itself. */
  next?: string;
}

function waitMessage(retryAfterSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return `Too many tries just now. Please wait about ${String(minutes)} minute${minutes === 1 ? '' : 's'} and try again.`;
}

async function requestIp(): Promise<string> {
  return clientIp(await headers());
}

/** Step 1: which door does this address come through? */
export async function checkEntryAction(emailRaw: string): Promise<EntryCheckResponse> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }
  const ip = await requestIp();
  const perEmail = checkLimit('entryEmail', email);
  if (!perEmail.ok) return { ok: false, error: waitMessage(perEmail.retryAfterSeconds) };
  const perIp = checkLimit('entryIp', ip);
  if (!perIp.ok) return { ok: false, error: waitMessage(perIp.retryAfterSeconds) };

  const decision = await checkEntry(email);
  return {
    ok: true,
    branch: decision.branch,
    listed: decision.listed,
    ...(decision.problem === null ? {} : { problem: decision.problem }),
  };
}

/** Step 3: send the six-digit code. Reveals nothing about the address. */
export async function sendCodeAction(emailRaw: string): Promise<SimpleResponse> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { ok: false, error: 'Please enter a valid email address.' };

  const perEmail = checkLimit('otpSendEmail', email);
  if (!perEmail.ok) return { ok: false, error: waitMessage(perEmail.retryAfterSeconds) };
  const perIp = checkLimit('otpSendIp', await requestIp());
  if (!perIp.ok) return { ok: false, error: waitMessage(perIp.retryAfterSeconds) };

  const supabase = await serverSupabase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Clicking the link inside the email verifies the inbox too. The link
      // lands back here, already verified, and the code step is skipped.
      emailRedirectTo: `${appUrl()}/auth/callback?next=/signup`,
    },
  });

  if (error !== null) {
    const failure = authFailure(error.message);
    // The raw wording goes to the trail, so the first failure after a change
    // tells the operator everything: which rule matched, what Supabase actually
    // said, and the change that fixes it.
    await logEntryEvent({
      kind: 'code_sent',
      email,
      code: failure.code,
      meta: { said: error.message.slice(0, 200), status: error.status ?? null, fix: failure.fix },
    });
    return { ok: false, error: failure.message };
  }
  await logEntryEvent({ kind: 'code_sent', email, code: 'OK' });
  return { ok: true };
}

/** Step 4: check the code. A correct code opens a session for that inbox. */
export async function verifyCodeAction(emailRaw: string, code: string): Promise<SimpleResponse> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { ok: false, error: 'Please enter a valid email address.' };
  if (!/^\d{6}$/.test(code.trim())) return { ok: false, error: 'Please enter the 6-digit code.' };

  const perIp = checkLimit('otpVerify', await requestIp());
  if (!perIp.ok) return { ok: false, error: waitMessage(perIp.retryAfterSeconds) };

  const supabase = await serverSupabase();
  const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
  if (error !== null) {
    const failure = authFailure(error.message);
    await logEntryEvent({
      kind: 'code_failed',
      email,
      code: failure.kind === 'code-wrong-or-expired' ? 'EXPIRED_OR_WRONG' : failure.code,
      meta: { said: error.message.slice(0, 200), status: error.status ?? null },
    });
    return {
      ok: false,
      error: 'That code is not right, or it has expired. Check the newest email and try again.',
    };
  }

  await logEntryEvent({ kind: 'code_verified', email, code: 'OK' });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return { ok: false, error: 'Could not finish signing you in. Please try again.' };
  return { ok: true, next: await routeOrFinish(supabase, user.id) };
}

export interface CompleteEntryInput {
  fullName: string;
  password: string;
  acceptedTerms: boolean;
  /** A plan the visitor clicked while it is not open yet. Recorded, never granted. */
  wish?: PlanId | null;
}

/** Step 5: account + Solo free year, active immediately. */
export async function completeEntryAction(input: CompleteEntryInput): Promise<SimpleResponse> {
  const ip = await requestIp();
  const perIp = checkLimit('activateIp', ip);
  if (!perIp.ok) return { ok: false, error: waitMessage(perIp.retryAfterSeconds) };

  const fullName = input.fullName.trim();
  if (fullName.length < 2) return { ok: false, error: 'Please enter your account name.' };
  if (fullName.length > 100) return { ok: false, error: 'That name is a little too long.' };
  if (!input.acceptedTerms) {
    return { ok: false, error: 'Please accept the Terms and Privacy Policy to continue.' };
  }
  const passwordIssue = passwordProblem(input.password);
  if (passwordIssue !== null) return { ok: false, error: passwordIssue };

  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return { ok: false, error: 'Your session has ended. Please start again with your email.' };
  }
  const email = normalizeEmail(asText(user.email));
  if (email === '') {
    return { ok: false, error: 'Your session has ended. Please start again with your email.' };
  }
  if (asText(user.email_confirmed_at) === '') {
    // The code step cannot be skipped: no verified inbox, no account.
    return { ok: false, error: 'Please verify your email code first.' };
  }

  const breach = await checkPasswordBreach(input.password);
  if (breach.breached) {
    return {
      ok: false,
      error: 'That password appears in a known data leak. Please choose a different one.',
    };
  }

  const already = await hasProfile(supabase, user.id);
  if (!already) {
    const { error: passwordError } = await supabase.auth.updateUser({
      password: input.password,
      data: { full_name: fullName },
    });
    if (passwordError !== null) {
      console.error(`completeEntry: password update failed: ${passwordError.message}`);
      return { ok: false, error: 'Could not set your password. Please try again.' };
    }

    const listed = await listedEmail(email);
    const profileWritten = await writeProfile(supabase, {
      id: user.id,
      fullName,
      earlyAccess: listed === true,
    });
    if (!profileWritten) {
      return {
        ok: false,
        error: 'We could not finish creating your account just now. Please try again in a moment.',
      };
    }
    await auditEvent({
      actorProfileId: user.id,
      action: 'account.created',
      entity: 'profile',
      entityId: user.id,
      meta: { terms: TERMS_VERSION, door: listed === true ? 'waitlist' : 'plans' },
    });
    await logEntryEvent({
      kind: 'account_created',
      email,
      code: 'OK',
      meta: { door: listed === true ? 'waitlist' : 'plans' },
    });
  }

  const activated = await activateFreeYearForCurrentUser();
  if (!activated.ok) {
    // The account exists and the inbox is proven; only the free year is
    // missing. Say so and send them where that is finished, never a dead end.
    await logEntryEvent({ kind: 'activation', email, code: 'ACTIVATION_FUNCTION_MISSING' });
    redirect('/billing?setup=activation');
  }

  if (input.wish !== undefined && input.wish !== null && input.wish !== 'solo') {
    await recordWish(email, input.wish, user.id);
  }

  redirect('/portal');
}

/** Sign-in page only: where a returning, verified visit belongs. */
export async function routeAfterSignInAction(): Promise<SimpleResponse> {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) return { ok: false, error: 'You are not signed in.' };
  return { ok: true, next: await routeOrFinish(supabase, user.id) };
}

/** A plan click while the plan is closed: recorded, never granted. */
export async function recordPlanWishAction(emailRaw: string, planId: PlanId): Promise<SimpleResponse> {
  if (planId === 'solo') return { ok: true };
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) return { ok: true };
  const perEmail = checkLimit('wishEmail', email);
  if (!perEmail.ok) return { ok: true };
  await recordWish(email, planId);
  return { ok: true };
}

async function routeOrFinish(
  supabase: Awaited<ReturnType<typeof serverSupabase>>,
  userId: string,
): Promise<string> {
  if (!(await hasProfile(supabase, userId))) return '/signup';
  const access = await accessForUser(supabase, userId);
  return access.canEnterPortal ? '/portal' : '/billing';
}

async function writeProfile(
  supabase: Awaited<ReturnType<typeof serverSupabase>>,
  input: { id: string; fullName: string; earlyAccess: boolean },
): Promise<boolean> {
  const row = {
    id: input.id,
    full_name: input.fullName,
    terms_version: TERMS_VERSION,
    terms_accepted_at: new Date().toISOString(),
    is_early_access: input.earlyAccess,
  };
  const own = await supabase.from('profiles').insert(row);
  if (own.error === null) return true;
  console.error(`completeEntry: profile insert with the owner session failed: ${own.error.message}`);
  const admin = adminSupabaseOrNull();
  if (admin === null) return false;
  const fallback = await admin.from('profiles').insert(row);
  if (fallback.error !== null) {
    console.error(`completeEntry: profile insert with the service key failed: ${fallback.error.message}`);
    return false;
  }
  return true;
}

async function listedEmail(email: string): Promise<boolean | null> {
  const admin = adminSupabaseOrNull();
  if (admin === null) return null;
  const byColumn = await admin
    .from('early_access_emails')
    .select('id')
    .eq('email_norm', email)
    .limit(1);
  if (byColumn.error === null) return asRows(byColumn.data).length > 0;
  const scan = await admin.from('early_access_emails').select('email').limit(1000);
  if (scan.error !== null) return null;
  return asRows(scan.data).some((row) => {
    const value = asRecord(row).email;
    return typeof value === 'string' && value.trim().toLowerCase() === email;
  });
}

/** Records interest in a plan that is not open yet. Grants nothing, ever. */
async function recordWish(email: string, planId: PlanId, profileId: string | null = null): Promise<void> {
  await logEntryEvent({ kind: 'plan_wish', email, code: 'OK', meta: { plan: planId } });
  const admin = adminSupabaseOrNull();
  if (admin === null || profileId === null) return;
  try {
    const { error } = await admin
      .from('subscriptions')
      .update({ pending_plan: planId })
      .eq('profile_id', profileId);
    if (error !== null) console.info(`wish column not written: ${error.message}`);
  } catch {
    // The wish is already in the entry trail; the column is a nicety.
  }
}


