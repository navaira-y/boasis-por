import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FAKE_ANON_KEY,
  FAKE_SERVICE_KEY,
  startFakeSupabase,
  type FakeSupabase,
} from '../test/harness/fake-supabase';
// Imported statically on purpose: every environment read in this app happens
// when a function is called, never at module load, so setting process.env in
// beforeAll is enough. (That is also why a runtime value beats a build-time
// one in the container.)
import { checkEntry } from './entry';
import { resetHealthCache } from './diagnose';

/**
 * checkEntry against a real HTTP endpoint, with the real Supabase client.
 *
 * This is the test for the bug that broke signup: a listed founder was told
 * "Could not check that email" and sent to the plans door. Every path below is
 * one of the ways that happened, and each one now names itself.
 */

const OPERATOR = 'navaira.builds@gmail.com';

// The admin client never touches cookies; only the visitor client does, and it
// is not part of this test.
vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [], set: () => undefined, delete: () => undefined }),
}));

let fake: FakeSupabase;

beforeAll(async () => {
  fake = await startFakeSupabase({ anonKey: FAKE_ANON_KEY, serviceKey: FAKE_SERVICE_KEY });
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = FAKE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_KEY;
});

afterEach(() => {
  fake.setMode('healthy');
  fake.setList([{ id: 'row-1', email: OPERATOR, status: 'invited' }]);
  resetHealthCache();
});

afterAll(async () => {
  await fake.close();
});

describe('a listed address', () => {
  it('takes the waitlist door', async () => {
    const decision = await checkEntry(OPERATOR);
    expect(decision.branch).toBe('waitlist');
    expect(decision.listed).toBe(true);
    expect(decision.problem).toBeNull();
  });

  it('is found however the visitor types it, because the lookup is lowercased', async () => {
    const decision = await checkEntry('  Navaira.Builds@GMAIL.com ');
    expect(decision.branch).toBe('waitlist');
    expect(decision.listed).toBe(true);
    // The value the database was asked about must be the normalised one.
    const listRequests = fake.requests.filter((entry) => entry.path === '/rest/v1/early_access_emails');
    expect(listRequests.length).toBeGreaterThan(0);
    for (const request of listRequests) {
      if (request.query.includes('eq.')) {
        expect(request.query).not.toContain('Navaira');
        expect(request.query.toLowerCase()).toContain(encodeURIComponent(OPERATOR));
      }
    }
  });

  it('is found when the stored row keeps its capitals', async () => {
    fake.setList([{ id: 'row-1', email: 'Navaira.Builds@Gmail.com', status: 'invited' }]);
    const decision = await checkEntry(OPERATOR);
    expect(decision.branch).toBe('waitlist');
    expect(decision.listed).toBe(true);
  });
});

describe('an address that is not on the list', () => {
  it('takes the plans door, with no problem attached', async () => {
    const decision = await checkEntry('someone.else@example.com');
    expect(decision.branch).toBe('plans');
    expect(decision.listed).toBe(false);
    expect(decision.problem).toBeNull();
  });
});

describe('the failures that used to read "Could not check that email"', () => {
  it('an invalid address is refused by name', async () => {
    const decision = await checkEntry('not-an-address');
    expect(decision.error).toBe('Please enter a valid email address.');
  });

  it('a missing service key still lets signup continue, and says so', async () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetHealthCache();
    const decision = await checkEntry(OPERATOR);
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;

    expect(decision.branch).toBe('plans');
    expect(decision.listed).toBeNull();
    expect(decision.problem?.code).toBe('ENV_SERVICE_MISSING');
    expect(decision.problem?.continueAllowed).toBe(true);
    expect(decision.problem?.title).toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('a rejected service key is named, not swallowed', async () => {
    fake.setMode('service-key-rejected');
    resetHealthCache();
    const decision = await checkEntry(OPERATOR);

    expect(decision.branch).toBe('plans');
    expect(decision.listed).toBeNull();
    expect(decision.problem?.code).toBe('SERVICE_KEY_REJECTED');
    expect(decision.problem?.continueAllowed).toBe(true);
    // Not the generic sentence: the founder reads what to fix.
    expect(decision.problem?.title).not.toBe('');
    expect(decision.problem?.fix.length).toBeGreaterThan(10);
  });

  it('a missing early-access table is named with the migration to run', async () => {
    fake.setMode('list-missing');
    resetHealthCache();
    const decision = await checkEntry(OPERATOR);

    expect(decision.problem?.code).toBe('LIST_TABLE_MISSING');
    expect(decision.problem?.fix).toContain('0007');
  });

  it('a project that cannot be reached is named', async () => {
    fake.setMode('db-down');
    resetHealthCache();
    const decision = await checkEntry(OPERATOR);

    expect(decision.branch).toBe('plans');
    expect(decision.problem?.code).toBe('DB_UNREACHABLE');
  });

  it('a key that cannot read the private tables is never trusted with an empty list', async () => {
    fake.setMode('privilege-not-proven');
    resetHealthCache();
    const decision = await checkEntry(OPERATOR);

    // This is the silent empty read: told nothing, the app would have said
    // "not on the list" and sent a listed founder to the plans door.
    expect(decision.branch).toBe('plans');
    expect(decision.listed).toBeNull();
    expect(decision.problem?.code).toBe('SERVICE_NOT_SERVICE');
  });

  it('an empty list that could not be verified at all is reported, never guessed', async () => {
    fake.setMode('privilege-unknown');
    resetHealthCache();
    const decision = await checkEntry(OPERATOR);

    expect(decision.listed).toBeNull();
    expect(decision.problem?.code).toBe('LIST_EMPTY_UNVERIFIED');
  });

  it('an empty list from a proven key is a real answer: the plans door', async () => {
    fake.setMode('list-empty');
    resetHealthCache();
    const decision = await checkEntry(OPERATOR);

    expect(decision.branch).toBe('plans');
    expect(decision.listed).toBe(false);
    expect(decision.problem).toBeNull();
  });
});

describe('the entry trail', () => {
  it('records the check in entry_events with the real address', async () => {
    await checkEntry(OPERATOR);
    const writes = fake.requests.filter(
      (entry) => entry.method === 'POST' && entry.path === '/rest/v1/entry_events',
    );
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every((entry) => entry.keyRole === 'service')).toBe(true);
  });
});
