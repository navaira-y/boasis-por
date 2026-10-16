import 'server-only';
import { adminSupabaseOrNull, serverSupabase } from './supabase';
import { freeYearEnd } from './renewals';
import { logEntryEvent } from './log';
import { asRecord, asText } from './shape';

/**
 * Starting the free year, in one place.
 *
 * Preferred path: public.activate_free_year(), a database function that
 * re-checks the verified inbox itself and grants the standard first year once
 * per account. That makes signup independent of the service key: a key or
 * project problem can no longer block a founder from entering. It is not
 * "self-activation" of anything valuable: the free year is what every verified
 * account gets, the grant is once-only, and the row written is exactly what
 * the service path would write.
 *
 * Fallback path: the service role, for a project where migration 0008 has not
 * been applied yet. If both fail the caller says so plainly; nothing is
 * silently half-created.
 */

export interface ActivationResult {
  ok: boolean;
  code: 'OK' | 'ACTIVATION_FUNCTION_MISSING' | 'ACTIVATION_FAILED';
  periodEnd: string | null;
}

export async function activateFreeYearForCurrentUser(): Promise<ActivationResult> {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) {
    return { ok: false, code: 'ACTIVATION_FAILED', periodEnd: null };
  }
  if (user.email_confirmed_at == null) {
    return { ok: false, code: 'ACTIVATION_FAILED', periodEnd: null };
  }

  const viaFunction = await supabase.rpc('activate_free_year');
  if (viaFunction.error === null) {
    const payload = asRecord(viaFunction.data);
    const periodEnd = asText(payload.period_end) === '' ? null : asText(payload.period_end);
    if (asText(payload.source) === 'already-used') {
      await logEntryEvent({ kind: 'activation', email: user.email, code: 'ALREADY_USED' });
    } else {
      await logEntryEvent({ kind: 'activation', email: user.email, code: 'OK' });
    }
    return { ok: true, code: 'OK', periodEnd };
  }

  const message = asText(viaFunction.error.message);
  const missingFunction = /could not find the function|does not exist|PGRST202|42883/i.test(
    message,
  );
  if (!missingFunction) {
    console.error(`activation: database function failed: ${message}`);
  }

  const admin = adminSupabaseOrNull();
  if (admin === null) {
    await logEntryEvent({ kind: 'activation', email: user.email, code: 'ENV_SERVICE_MISSING' });
    return { ok: false, code: 'ACTIVATION_FUNCTION_MISSING', periodEnd: null };
  }

  const startedAt = new Date();
  const periodEnd = freeYearEnd(startedAt);
  const { data: existing, error: readError } = await admin
    .from('subscriptions')
    .select('id,status,provider,activated_at,free_year_used_at')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (readError !== null) {
    console.error(`activation: subscription read failed: ${readError.message}`);
    return { ok: false, code: 'ACTIVATION_FAILED', periodEnd: null };
  }

  if (existing !== null) {
    const row = existing as Record<string, unknown>;
    // Already granted, or a paid plan is in force: never overwrite either.
    if (row.free_year_used_at !== null) {
      return { ok: true, code: 'OK', periodEnd: null };
    }
    if (row.status === 'active' && row.provider !== 'free') {
      return { ok: true, code: 'OK', periodEnd: null };
    }
  }

  const values = {
    plan_id: 'solo',
    status: 'active',
    provider: 'free',
    current_period_start: startedAt.toISOString(),
    current_period_end: periodEnd.toISOString(),
    activated_at: startedAt.toISOString(),
    free_year_used_at: startedAt.toISOString(),
  };

  const write =
    existing === null
      ? await admin.from('subscriptions').insert({ profile_id: user.id, ...values })
      : await admin.from('subscriptions').update(values).eq('profile_id', user.id);

  if (write.error !== null) {
    console.error(`activation: subscription write failed: ${write.error.message}`);
    return { ok: false, code: 'ACTIVATION_FUNCTION_MISSING', periodEnd: null };
  }

  await logEntryEvent({ kind: 'activation_fallback', email: user.email, code: 'OK' });
  return { ok: true, code: 'OK', periodEnd: periodEnd.toISOString() };
}
