import { describe, expect, it } from 'vitest';
import { authFailure, isOperatorProblem } from './auth-error';

/**
 * Every message below is one Supabase Auth is known to return. The point of the
 * mapper is that the founder reading the screen (and the operator reading the
 * trail) get the CAUSE, not "please try again".
 */

describe('the mailer itself', () => {
  it('names an unconfigured or refusing sender', () => {
    const failure = authFailure('Error sending magic link email');
    expect(failure.code).toBe('AUTH_SMTP_MISSING');
    expect(failure.fix).toContain('SMTP settings');
    expect(isOperatorProblem(failure)).toBe(true);
  });

  it('names the shared-mailer restriction on who may receive', () => {
    const failure = authFailure('Email address is not authorized');
    expect(failure.code).toBe('AUTH_EMAIL_NOT_ALLOWED');
    expect(isOperatorProblem(failure)).toBe(true);
  });
});

describe('the rate limit', () => {
  it('tells the visitor to wait, and the operator about the ceiling', () => {
    const failure = authFailure('Email rate limit exceeded');
    expect(failure.code).toBe('AUTH_RATE_LIMIT');
    expect(failure.message).toContain('wait');
    expect(failure.fix).toContain('an hour');
    // Retrying IS the fix here, so it is not filed as an operator problem.
    expect(isOperatorProblem(failure)).toBe(false);
  });

  it('covers the 60-second sentence too', () => {
    expect(
      authFailure('For security purposes, you can only request this after 60 seconds.').code,
    ).toBe('AUTH_RATE_LIMIT');
  });
});

describe('project settings', () => {
  it('names a redirect that is not allow-listed', () => {
    const failure = authFailure('redirect_to is not allowed');
    expect(failure.code).toBe('AUTH_REDIRECT_NOT_ALLOWED');
    expect(failure.fix).toContain('Redirect URLs');
  });

  it('names switched-off signups', () => {
    expect(authFailure('Signups not allowed for this instance').code).toBe('AUTH_SIGNUPS_DISABLED');
  });
});

describe('the visitor own mistakes', () => {
  it('keeps the code sentence for a wrong or expired code', () => {
    expect(authFailure('Token has expired or is invalid').code).toBe('AUTH_CODE_INVALID');
    expect(authFailure('Invalid login credentials').code).toBe('AUTH_CODE_INVALID');
  });

  it('keeps the one-email-one-account rule', () => {
    const failure = authFailure('User already registered');
    expect(failure.code).toBe('AUTH_ALREADY_REGISTERED');
    expect(failure.message).toContain('sign in');
  });

  it('points at the password rule', () => {
    expect(authFailure('Password should be at least 12 characters.').code).toBe('AUTH_PASSWORD_POLICY');
  });
});

describe('anything unrecognised', () => {
  it('never claims to know, and says where to look', () => {
    const failure = authFailure('something new from Supabase');
    expect(failure.code).toBe('AUTH_UNKNOWN');
    expect(failure.fix).toContain('entry trail');
  });
});
