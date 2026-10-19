import { describe, expect, it } from 'vitest';
import { decideGate, isBillingPath, isPortalPath } from './gate';

const paths = ['/portal', '/portal/', '/portal/index.html', '/portal/assets/app.js'];

describe('path helpers', () => {
  it('knows the portal and the billing subtree', () => {
    for (const path of paths) expect(isPortalPath(path)).toBe(true);
    expect(isPortalPath('/signup')).toBe(false);
    expect(isBillingPath('/billing')).toBe(true);
    expect(isBillingPath('/billing/success')).toBe(true);
    expect(isBillingPath('/billingx')).toBe(false);
  });
});

describe('decideGate', () => {
  it('sends a visitor with no session to sign in', () => {
    for (const path of [...paths, '/billing']) {
      expect(
        decideGate({
          mfa: 'not-required',
          path,
          signedIn: false,
          emailConfirmed: false,
          status: null,
        }),
      ).toBe('to-signin');
    }
  });

  it('sends an unverified session back to finish the entry flow', () => {
    expect(
      decideGate({
        mfa: 'not-required',
        path: '/portal',
        signedIn: true,
        emailConfirmed: false,
        status: 'active',
      }),
    ).toBe('to-signup');
  });

  it('opens the portal only for an active subscription', () => {
    for (const path of paths) {
      expect(
        decideGate({
          mfa: 'not-required',
          path,
          signedIn: true,
          emailConfirmed: true,
          status: 'active',
        }),
      ).toBe('allow');
      for (const status of ['pending', 'incomplete', 'past_due', 'canceled', null] as const) {
        expect(
          decideGate({ mfa: 'not-required', path, signedIn: true, emailConfirmed: true, status }),
        ).toBe('to-billing');
      }
    }
  });

  it('lets a verified account reach the billing page whatever its status', () => {
    for (const status of ['active', 'past_due', 'canceled', null] as const) {
      expect(
        decideGate({
          mfa: 'not-required',
          path: '/billing',
          signedIn: true,
          emailConfirmed: true,
          status,
        }),
      ).toBe('allow');
    }
  });
});

describe('authenticator gate', () => {
  it.each(['required', 'unavailable'] as const)(
    'blocks %s assurance on every private route',
    (mfa) => {
      for (const path of [...paths, '/billing', '/billing/success']) {
        expect(
          decideGate({ path, signedIn: true, emailConfirmed: true, status: 'active', mfa }),
        ).toBe('to-mfa');
      }
    },
  );
  it('allows a verified second factor without bypassing the subscription gate', () => {
    expect(
      decideGate({
        path: '/portal',
        signedIn: true,
        emailConfirmed: true,
        status: 'active',
        mfa: 'verified',
      }),
    ).toBe('allow');
    expect(
      decideGate({
        path: '/portal',
        signedIn: true,
        emailConfirmed: true,
        status: 'past_due',
        mfa: 'verified',
      }),
    ).toBe('to-billing');
  });
});
