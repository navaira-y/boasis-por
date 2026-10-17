import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FAKE_ANON_KEY,
  FAKE_SERVICE_KEY,
  startFakeSupabase,
  type FakeSupabase,
} from '../test/harness/fake-supabase';
import { billingForUser } from './billing';
import { accessForUser } from './access';
import { serverSupabase, type VisitorDbClient } from './supabase';
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => undefined }) }));

let fake: FakeSupabase;
let client: VisitorDbClient;
const userId = '11111111-1111-4111-8111-111111111111';
const reset = () => {
  fake.setMode('healthy');
  fake.setSubscriptionStatus('active');
  fake.setSubscription({
    plan_id: 'solo',
    provider: 'free',
    current_period_start: '2026-10-17T09:00:00Z',
    current_period_end: '2027-10-17T09:00:00Z',
    free_year_used_at: '2026-10-17T09:00:00Z',
  });
};
beforeAll(async () => {
  fake = await startFakeSupabase({ anonKey: FAKE_ANON_KEY, serviceKey: FAKE_SERVICE_KEY });
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = FAKE_ANON_KEY;
});
beforeEach(async () => {
  client = await serverSupabase();
});
afterEach(reset);
afterAll(async () => {
  await fake.close();
});

describe('subscription reads over the real Supabase HTTP client', () => {
  it('reads actual dates and plan records, with no service-role access', async () => {
    const before = fake.requests.length;
    const snapshot = await billingForUser(client, userId);
    expect(snapshot.subscription?.periodEnd).toBe('2027-10-17T09:00:00Z');
    expect(snapshot.plans.map((plan) => plan.name)).toEqual(['Solo', 'Trio', 'Enterprise']);
    const requests = fake.requests.slice(before);
    expect(requests.every((request) => request.keyRole === 'anon')).toBe(true);
    const subscription = requests.find((request) => request.path === '/rest/v1/subscriptions');
    expect(new URLSearchParams(subscription?.query).get('profile_id')).toBe(`eq.${userId}`);
  });
  it('keeps a missing row distinct from a failed lookup', async () => {
    fake.setSubscriptionStatus(null);
    expect((await billingForUser(client, userId)).subscription).toBeNull();
    fake.setMode('subscription-down');
    await expect(billingForUser(client, userId)).rejects.toThrow('Subscription lookup failed');
  });
  it('does not turn malformed plan ids into Solo', async () => {
    fake.setSubscription({ plan_id: 'standard' });
    await expect(billingForUser(client, userId)).rejects.toThrow();
  });
  it('does not substitute published offers if the catalog read is refused', async () => {
    fake.setMode('grants-missing');
    await expect(billingForUser(client, userId)).rejects.toThrow('Subscription lookup failed');
  });
  it('does not lose the paid provider or real Enterprise dates', async () => {
    fake.setSubscription({
      plan_id: 'enterprise',
      provider: 'manual',
      current_period_end: '2028-10-17T09:00:00Z',
    });
    expect((await billingForUser(client, userId)).subscription).toMatchObject({
      planId: 'enterprise',
      provider: 'manual',
      periodEnd: '2028-10-17T09:00:00Z',
    });
  });
  it('closes expired-active access at the exact instant, before the renewal job runs', async () => {
    const end = '2027-10-17T09:00:00Z';
    expect(
      (await accessForUser(client, userId, new Date('2027-10-17T08:59:59Z'))).canEnterPortal,
    ).toBe(true);
    const expired = await accessForUser(client, userId, new Date(end));
    expect(expired.canEnterPortal).toBe(false);
    expect(expired.status).toBe('past_due');
  });
  it.each(['pending', 'incomplete', 'past_due', 'canceled'])(
    'does not grant access to %s',
    async (status) => {
      fake.setSubscriptionStatus(status);
      expect(
        (await accessForUser(client, userId, new Date('2026-10-17T10:00:00Z'))).canEnterPortal,
      ).toBe(false);
    },
  );
  it('fails closed for a row without a period end', async () => {
    fake.setSubscription({ current_period_end: null });
    expect((await accessForUser(client, userId)).canEnterPortal).toBe(false);
  });
});
