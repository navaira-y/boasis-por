import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_ANON_KEY,
  FAKE_SERVICE_KEY,
  FAKE_TOKENS,
  FAKE_FACTOR_ID,
  startFakeSupabase,
  type FakeSupabase,
} from '../test/harness/fake-supabase';
import { serverSupabase, type VisitorDbClient } from './supabase';
import { securityMfa } from './mfa-service';
import { readMfaState } from './mfa';
import { routeForUser } from './access';
import { resetRateLimits } from './rate-limit';

vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => undefined }) }));
let fake: FakeSupabase;
let client: VisitorDbClient;
const userId = '11111111-1111-4111-8111-111111111111';
const verified = {
  id: FAKE_FACTOR_ID,
  factor_type: 'totp',
  status: 'verified' as const,
  friendly_name: 'My authenticator',
};
const proof = { factorId: FAKE_FACTOR_ID, code: '123456' };
const run = (operation: Parameters<typeof securityMfa>[1]) =>
  securityMfa(client, operation, 'test-ip');

beforeAll(async () => {
  fake = await startFakeSupabase({ anonKey: FAKE_ANON_KEY, serviceKey: FAKE_SERVICE_KEY });
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = FAKE_ANON_KEY;
});
beforeEach(async () => {
  resetRateLimits();
  fake.setMfa([]);
  fake.setMode('healthy');
  fake.setHasProfile(true);
  client = await serverSupabase();
  await client.auth.setSession({ access_token: FAKE_TOKENS.mfa, refresh_token: 'fixture-refresh' });
});
afterAll(async () => {
  await fake.close();
});

describe('MFA service over the real SDK and provider-shaped HTTP fixtures', () => {
  it('reads provider factors, not a local enabled flag', async () => {
    expect(await readMfaState(client)).toEqual({
      enabled: false,
      requiresVerification: false,
      factors: [],
    });
    fake.setMfa([verified]);
    expect(await readMfaState(client)).toMatchObject({ enabled: true, requiresVerification: true });
  });
  it('requires confirmed sign-in', async () => {
    const anonymous = await serverSupabase();
    await expect(securityMfa(anonymous, null, 'test-ip')).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });
  it('refuses setup until the database migration is installed', async () => {
    fake.setMode('mfa-not-ready');
    await expect(run({ operation: 'enroll', name: 'My app' })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });
  it('returns a QR and manual key, but enrollment alone does not enable MFA', async () => {
    const result = await run({ operation: 'enroll', name: 'My app' });
    expect(result).toMatchObject({
      ok: true,
      state: { enabled: false, requiresVerification: false },
      enrollment: { secret: 'JBSWY3DPEHPK3PXP' },
    });
    if (result.ok) expect(result.enrollment?.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it('wrong or expired codes cannot enable a pending authenticator', async () => {
    await run({ operation: 'enroll', name: 'My app' });
    await expect(
      run({ operation: 'verify', factorId: FAKE_FACTOR_ID, code: '000000' }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(await readMfaState(client)).toMatchObject({ enabled: false });
  });
  it('only provider verification enables MFA and uses the new AAL2 session', async () => {
    await run({ operation: 'enroll', name: 'My app' });
    expect(await run({ operation: 'verify', ...proof })).toMatchObject({
      ok: true,
      state: { enabled: true, requiresVerification: false, factors: [{ status: 'verified' }] },
    });
    expect((await client.auth.getSession()).data.session?.access_token).toBe(
      FAKE_TOKENS.mfaVerified,
    );
  });
  it('routes first-factor visitors to MFA before any profile or subscription reads', async () => {
    fake.setMfa([verified]);
    const before = fake.requests.length;
    expect(await routeForUser(client, userId)).toBe('/mfa');
    expect(fake.requests.slice(before).some((request) => request.path.startsWith('/rest/'))).toBe(
      false,
    );
  });
  it('does not trust a stale AAL2 cookie after the provider rejects that token', async () => {
    fake.setMfa([verified]);
    fake.setMode('anon-key-rejected');
    await expect(readMfaState(client)).rejects.toThrow();
  });
  it('fails closed on malformed provider factor data', async () => {
    fake.setMfa([{ ...verified, id: 'not-a-factor-uuid' }]);
    await expect(readMfaState(client)).rejects.toThrow();
    expect(await routeForUser(client, userId)).toBe('/mfa');
  });
  it('does not treat unsupported verified factors as a non-MFA account', async () => {
    fake.setMfa([{ ...verified, factor_type: 'phone' }]);
    expect(await readMfaState(client)).toMatchObject({
      enabled: false,
      requiresVerification: true,
      factors: [],
    });
  });
  it('requires fresh proof to add a backup, even from an AAL2 session', async () => {
    fake.setMfa([verified]);
    await run({ operation: 'verify', ...proof });
    await expect(run({ operation: 'enroll', name: 'Backup' })).rejects.toMatchObject({
      code: 'MFA_REQUIRED',
    });
  });
  it('rejects another factor id before any provider challenge', async () => {
    fake.setMfa([verified]);
    const before = fake.requests.length;
    await expect(
      run({
        operation: 'verify',
        factorId: '55555555-5555-4555-8555-555555555555',
        code: '123456',
      }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect(fake.requests.slice(before).some((request) => request.path.endsWith('/challenge'))).toBe(
      false,
    );
  });
  it('allows cancellation of pending setup without removing protection', async () => {
    await run({ operation: 'enroll', name: 'My app' });
    expect(await run({ operation: 'cancel', factorId: FAKE_FACTOR_ID })).toMatchObject({
      ok: true,
      state: { enabled: false, factors: [] },
    });
    fake.setMfa([verified]);
    await expect(run({ operation: 'cancel', factorId: FAKE_FACTOR_ID })).rejects.toMatchObject({
      code: 'INVALID',
    });
  });
  it('blocks removal with wrong proof, including in a remembered AAL2 session', async () => {
    fake.setMfa([verified]);
    await run({ operation: 'verify', ...proof });
    await expect(
      run({ operation: 'remove', factorId: FAKE_FACTOR_ID, proof: { ...proof, code: '000000' } }),
    ).rejects.toMatchObject({ code: 'INVALID' });
    expect((await readMfaState(client)).enabled).toBe(true);
  });
  it('rechecks the provider after last-factor removal', async () => {
    fake.setMfa([verified]);
    expect(await run({ operation: 'remove', factorId: FAKE_FACTOR_ID, proof })).toMatchObject({
      ok: true,
      state: { enabled: false, factors: [] },
    });
  });
  it('limits repeated code attempts before the provider challenge', async () => {
    fake.setMfa([verified]);
    for (let attempt = 0; attempt < 10; attempt += 1)
      await expect(run({ operation: 'verify', ...proof, code: '000000' })).rejects.toMatchObject({
        code: 'INVALID',
      });
    const before = fake.requests.length;
    await expect(run({ operation: 'verify', ...proof })).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
    expect(fake.requests.slice(before).some((request) => request.path.endsWith('/challenge'))).toBe(
      false,
    );
  });
  it('never uses the service role for enrollment, challenge, or account status', async () => {
    const before = fake.requests.length;
    await run({ operation: 'enroll', name: 'My app' });
    await run({ operation: 'verify', ...proof });
    expect(fake.requests.slice(before).every((request) => request.keyRole === 'anon')).toBe(true);
  });
});
