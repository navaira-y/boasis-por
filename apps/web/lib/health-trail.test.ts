import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  FAKE_ANON_KEY,
  FAKE_SERVICE_KEY,
  startFakeSupabase,
  type FakeSupabase,
} from '../test/harness/fake-supabase';
import { entryBlockers, resetHealthCache, runHealth } from './diagnose';

vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [], set: () => undefined, delete: () => undefined }),
}));

/**
 * The health report must PUT THE FAILURE ON SCREEN. A founder whose code email
 * was refused should not have to open a log viewer to find out why: the report
 * names the last refusal from the entry trail, and stays green because one
 * refusal is information, not an outage.
 */
let fake: FakeSupabase;

beforeAll(async () => {
  fake = await startFakeSupabase({
    anonKey: FAKE_ANON_KEY,
    serviceKey: FAKE_SERVICE_KEY,
    events: [
      { at: '2026-10-16T10:00:00Z', kind: 'entry_check', code: 'OK', email: 'navaira.builds@gmail.com' },
      { at: '2026-10-16T10:01:00Z', kind: 'code_sent', code: 'AUTH_SMTP_MISSING', email: 'n***@gmail.com' },
    ],
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = fake.url;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = FAKE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_SERVICE_KEY;
});

afterAll(async () => {
  await fake.close();
});

describe('a refusal on the entry trail', () => {
  it('is reported, named, and still not an outage', async () => {
    resetHealthCache();
    const report = await runHealth({ fresh: true, withEvents: true });

    expect(report.lastEntryFailure?.code).toBe('AUTH_SMTP_MISSING');
    expect(report.lastEntryFailure?.kind).toBe('code_sent');
    expect(report.codes).toContain('ENTRY_FAILURE_LOGGED');
    // A note, not a blocker: the door still works for everybody else.
    expect(report.ok).toBe(true);
  });

  it('reports how email is sent, and keeps that off the signup screen', async () => {
    resetHealthCache();
    const report = await runHealth({ fresh: true, withEvents: false });

    // The fake project has no sender of its own, like the real one today.
    expect(report.email?.codeLed).toBe(false);
    expect(report.email?.ownSender).toBe(false);
    expect(report.codes).toContain('EMAIL_BUILT_IN_SENDER');
    // Still green: the link works, the mailer is just limited.
    expect(report.ok).toBe(true);
    // And the door does not nag the visitor about it.
    expect(entryBlockers(report)).toEqual([]);
  });

  it('says nothing when the trail is clean', async () => {
    fake.setEvents([
      { at: '2026-10-16T10:02:00Z', kind: 'entry_check', code: 'OK', email: 'navaira.builds@gmail.com' },
      { at: '2026-10-16T10:03:00Z', kind: 'code_verified', code: 'LINK', email: 'navaira.builds@gmail.com' },
    ]);
    resetHealthCache();
    const report = await runHealth({ fresh: true, withEvents: true });

    expect(report.lastEntryFailure).toBeNull();
    expect(report.codes).not.toContain('ENTRY_FAILURE_LOGGED');
  });
});
