import { describe, expect, it } from 'vitest';
import { readKeyFacts, readUrlFacts } from './keys';

/** Builds a JWT-shaped string with the given payload (never a real key). */
function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature-not-a-real-signature`;
}

describe('readKeyFacts', () => {
  it('reads a JWT key without ever returning the key', () => {
    const key = fakeJwt({ ref: 'abcdefghijklmnop', role: 'service_role', exp: 1_800_000_000 });
    const facts = readKeyFacts(key);
    expect(facts.format).toBe('jwt');
    expect(facts.ref).toBe('abcdefghijklmnop');
    expect(facts.role).toBe('service_role');
    expect(facts.expiresAt).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(Object.values(facts)).not.toContain(key);
  });

  it('recognises the new-style keys by prefix alone', () => {
    expect(readKeyFacts('sb_secret_abcdef')).toMatchObject({ format: 'sb_secret', role: 'service_role' });
    expect(readKeyFacts('sb_publishable_abcdef')).toMatchObject({ format: 'sb_publishable', role: 'anon' });
  });

  it('marks an unreadable value instead of pretending', () => {
    expect(readKeyFacts('not-a-key').format).toBe('unknown');
    expect(readKeyFacts('   ').format).toBe('absent');
    expect(readKeyFacts(null).format).toBe('absent');
    expect(readKeyFacts(undefined).length).toBe(0);
  });
});

describe('readUrlFacts', () => {
  it('accepts a project URL and reports its reference', () => {
    expect(readUrlFacts('https://abcdefghijklmnop.supabase.co')).toMatchObject({
      ok: true,
      ref: 'abcdefghijklmnop',
    });
    expect(readUrlFacts('https://abcdefghijklmnop.supabase.co/')).toMatchObject({
      ok: true,
      ref: 'abcdefghijklmnop',
    });
  });

  it('accepts a loopback project URL for local work and tests', () => {
    // A local Supabase has no project reference to compare keys against.
    expect(readUrlFacts('http://127.0.0.1:54321')).toMatchObject({ ok: true, ref: null });
    expect(readUrlFacts('http://localhost:54321')).toMatchObject({ ok: true, ref: null });
    expect(readUrlFacts('http://127.0.0.1:54321/rest/v1')).toMatchObject({ problem: 'has-path' });
  });

  it('names the common paste mistakes', () => {
    expect(readUrlFacts('').problem).toBe('empty');
    expect(readUrlFacts('not a url').problem).toBe('not-a-url');
    expect(readUrlFacts('http://abcdefghijklmnop.supabase.co').problem).toBe('not-https');
    expect(readUrlFacts('https://abcdefghijklmnop.supabase.co/dashboard').problem).toBe('has-path');
    expect(readUrlFacts('https://something.example.com').problem).toBe('not-supabase');
  });
});
