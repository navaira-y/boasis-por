// Client-safe imports only: middleware also uses this verified-session check.
import { AuthFactorRecord, type MfaState } from '@boasis/schema';
import type { User } from '@supabase/supabase-js';
import type { VisitorDbClient } from './supabase';

export async function mfaForVerifiedUser(client: VisitorDbClient, user: User): Promise<MfaState> {
  const all = AuthFactorRecord.array().parse(user.factors ?? []);
  const factors = all
    .filter((factor) => factor.factor_type === 'totp')
    .map((factor) => ({
      id: factor.id,
      name: factor.friendly_name ?? 'Authenticator',
      status: factor.status,
    }));
  const enabled = factors.some((factor) => factor.status === 'verified');
  if (!all.some((factor) => factor.status === 'verified')) {
    return { enabled: false, requiresVerification: false, factors };
  }
  const { data: session, error: sessionError } = await client.auth.getSession();
  if (sessionError !== null || session.session === null) throw new Error('MFA session unavailable');
  // The explicit-JWT SDK variant revalidates it with Auth. Never trust factors
  // from the session cookie, user_metadata, localStorage, or a decoded JWT alone.
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel(
    session.session.access_token,
  );
  if (error !== null || (data.currentLevel !== 'aal1' && data.currentLevel !== 'aal2')) {
    throw new Error('MFA assurance unavailable');
  }
  return { enabled, requiresVerification: data.currentLevel !== 'aal2', factors };
}

export async function readMfaState(client: VisitorDbClient): Promise<MfaState> {
  const { data, error } = await client.auth.getUser();
  if (error !== null || data.user.email_confirmed_at == null)
    throw new Error('Verified sign-in required');
  return mfaForVerifiedUser(client, data.user);
}
