import 'server-only';
import {
  AuthenticatorEnrollment,
  type MfaReply,
  type MfaOperation,
  type MfaState,
} from '@boasis/schema';
import type { VisitorDbClient } from './supabase';
import { mfaForVerifiedUser, readMfaState } from './mfa';
import { checkLimit } from './rate-limit';

export class MfaFailure extends Error {
  constructor(
    readonly code: Extract<MfaReply, { ok: false }>['code'],
    message: string,
  ) {
    super(message);
  }
}

async function verifyCode(
  client: VisitorDbClient,
  state: MfaState,
  factorId: string,
  code: string,
  userId: string,
  ip: string,
  verifiedOnly: boolean,
): Promise<void> {
  const factor = state.factors.find((entry) => entry.id === factorId);
  if (
    factor === undefined ||
    ((verifiedOnly || state.requiresVerification) && factor.status !== 'verified')
  ) {
    throw new MfaFailure('INVALID', 'Choose one of your verified authenticators.');
  }
  if (
    !checkLimit('otpVerify', `mfa-user:${userId}`).ok ||
    !checkLimit('otpVerify', `mfa-ip:${ip}`).ok
  ) {
    throw new MfaFailure(
      'RATE_LIMITED',
      'Too many attempts. Please wait before trying another code.',
    );
  }
  const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (error !== null)
    throw new MfaFailure(
      'INVALID',
      'That authenticator code was not accepted. Check the app and try a new code.',
    );
}

export async function securityMfa(
  client: VisitorDbClient,
  operation: MfaOperation | null,
  ip: string,
): Promise<MfaReply> {
  const { data, error } = await client.auth.getUser();
  if (error !== null || data.user.email_confirmed_at == null) {
    throw new MfaFailure('AUTH_REQUIRED', 'Sign in with a verified email address first.');
  }
  const user = data.user;
  const ready = await client.rpc('mfa_guard_ready');
  if (ready.error !== null || ready.data !== true) {
    throw new MfaFailure(
      'UNAVAILABLE',
      'Authenticator setup is not ready on the server. Please try again later.',
    );
  }
  const state = await mfaForVerifiedUser(client, user);
  if (operation === null) return { ok: true, state };
  if (!checkLimit('mfaManage', `user:${user.id}`).ok || !checkLimit('mfaManage', `ip:${ip}`).ok) {
    throw new MfaFailure('RATE_LIMITED', 'Too many security requests. Please wait and try again.');
  }
  switch (operation.operation) {
    case 'enroll': {
      // Adding a backup also needs a fresh code, not just a remembered AAL2 session.
      if (state.enabled || state.requiresVerification) {
        if (operation.proof === undefined)
          throw new MfaFailure(
            'MFA_REQUIRED',
            'Verify an existing authenticator before adding another.',
          );
        await verifyCode(
          client,
          state,
          operation.proof.factorId,
          operation.proof.code,
          user.id,
          ip,
          true,
        );
      }
      const result = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: operation.name,
        issuer: 'Boasis',
      });
      if (result.error !== null)
        throw new MfaFailure(
          'UNAVAILABLE',
          'Could not start authenticator setup. Check its name is unique and try again.',
        );
      const enrollment = AuthenticatorEnrollment.parse({
        factorId: result.data.id,
        qrCode: `data:image/svg+xml;base64,${Buffer.from(result.data.totp.qr_code.replace(/^data:image\/svg\+xml;utf-8,/, ''), 'utf8').toString('base64')}`,
        secret: result.data.totp.secret,
      });
      return { ok: true, state: await readMfaState(client), enrollment };
    }
    case 'verify': {
      await verifyCode(client, state, operation.factorId, operation.code, user.id, ip, false);
      const verified = await readMfaState(client);
      if (
        verified.requiresVerification ||
        !verified.factors.some(
          (factor) => factor.id === operation.factorId && factor.status === 'verified',
        )
      ) {
        throw new MfaFailure(
          'UNAVAILABLE',
          'Verification could not be confirmed. Reload to check your authenticator status.',
        );
      }
      return { ok: true, state: verified };
    }
    case 'cancel': {
      const factor = state.factors.find(
        (entry) => entry.id === operation.factorId && entry.status === 'unverified',
      );
      if (factor === undefined)
        throw new MfaFailure('INVALID', 'Only unfinished setup can be discarded here.');
      if (state.requiresVerification)
        throw new MfaFailure('MFA_REQUIRED', 'Verify your authenticator first.');
      const removed = await client.auth.mfa.unenroll({ factorId: factor.id });
      if (removed.error !== null)
        throw new MfaFailure('UNAVAILABLE', 'Could not discard setup. Reload to check its status.');
      return { ok: true, state: await readMfaState(client) };
    }
    case 'remove': {
      if (
        !state.factors.some(
          (entry) => entry.id === operation.factorId && entry.status === 'verified',
        )
      )
        throw new MfaFailure('INVALID', 'Choose one of your verified authenticators.');
      await verifyCode(
        client,
        state,
        operation.proof.factorId,
        operation.proof.code,
        user.id,
        ip,
        true,
      );
      const removed = await client.auth.mfa.unenroll({ factorId: operation.factorId });
      if (removed.error !== null)
        throw new MfaFailure(
          'UNAVAILABLE',
          'Could not remove this authenticator. Reload to check its status.',
        );
      const final = await readMfaState(client);
      if (final.factors.some((factor) => factor.id === operation.factorId))
        throw new MfaFailure(
          'UNAVAILABLE',
          'Removal could not be confirmed. Reload to check your status.',
        );
      return { ok: true, state: final };
    }
  }
}
