import { describe, expect, it } from 'vitest';
import { portalCsp } from './csp';

const PROJECT = 'https://abcdefghijklmnop.supabase.co';

describe('the portal policy', () => {
  const policy = portalCsp(PROJECT);

  it('allows scripts from this origin only', () => {
    expect(policy).toContain("script-src 'self'");
    // The whole point: no inline script, no eval, no third-party script host.
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain('unsafe-eval');
  });

  it('cannot be framed by another site, and cannot load plugins', () => {
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
  });

  it('allows exactly the two font hosts the portal shell links', () => {
    expect(policy).toContain('style-src');
    expect(policy).toContain('https://fonts.googleapis.com');
    expect(policy).toContain('font-src');
    expect(policy).toContain('https://fonts.gstatic.com');
  });

  it('reaches Supabase over REST and realtime', () => {
    expect(policy).toContain(`connect-src 'self' ${PROJECT} wss://abcdefghijklmnop.supabase.co`);
  });

  it('allows the portal own breach check, and no other third party', () => {
    expect(policy).toContain('https://api.pwnedpasswords.com');
    const connect = policy.split('connect-src')[1] ?? '';
    const hosts = connect.match(/https?:\/\/[a-z0-9.-]+/g) ?? [];
    expect(hosts).toEqual([PROJECT, 'https://api.pwnedpasswords.com']);
  });

  it('allows the blob URLs the portal uses for downloads', () => {
    expect(policy).toContain('blob:');
    expect(policy).toContain('worker-src');
  });

  it('says nothing but self when the project URL is missing', () => {
    const bare = portalCsp(null);
    expect(bare).toContain("connect-src 'self'");
    expect(bare).not.toContain('supabase.co');
  });

  it('ignores a value that is not a URL instead of emitting it', () => {
    expect(portalCsp('not a url')).not.toContain('not a url');
  });

  it('uses wss for https projects and ws only for a local one', () => {
    expect(portalCsp('http://127.0.0.1:54321')).toContain(
      "connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321",
    );
  });
});
