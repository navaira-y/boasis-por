import { describe, expect, it } from 'vitest';
import { sameOriginSecurityRequest } from './security-origin';
const check = (headers: Record<string, string>) =>
  sameOriginSecurityRequest(new Request('http://internal:3000/api/security/mfa', { headers }));
describe('security mutation origins', () => {
  it('permits the production reverse proxy and the live preview origin', () => {
    expect(
      check({
        origin: 'https://portal.example.com',
        host: 'portal.example.com',
        'x-forwarded-proto': 'https',
      }),
    ).toBe(true);
    expect(
      check({
        origin: 'https://3000-sandbox.e2b.app',
        host: '3000-sandbox.e2b.app',
        'x-forwarded-proto': 'https',
      }),
    ).toBe(true);
  });
  it('permits a local browser form POST', () => {
    expect(check({ origin: 'http://internal:3000', host: 'internal:3000' })).toBe(true);
  });
  const badOrigins: Record<string, string>[] = [
    {},
    { origin: 'null' },
    { origin: 'not a URL' },
    { origin: 'https://attacker.example.com' },
  ];
  it.each(badOrigins)('rejects absent or untrusted origins: %o', (headers) => {
    expect(check({ host: 'portal.example.com', ...headers })).toBe(false);
  });
  it('does not trust forwarded-host or allow a cross-site override', () => {
    expect(
      check({
        origin: 'https://attacker.example.com',
        host: 'portal.example.com',
        'x-forwarded-host': 'attacker.example.com',
        'x-forwarded-proto': 'https',
      }),
    ).toBe(false);
    expect(
      check({
        origin: 'http://internal:3000',
        host: 'internal:3000',
        'sec-fetch-site': 'cross-site',
      }),
    ).toBe(false);
  });
});
