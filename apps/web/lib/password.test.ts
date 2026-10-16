import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PASSWORD_MIN_LENGTH, checkPasswordBreach, passwordProblem } from './password';

describe('passwordProblem', () => {
  it('requires at least twelve characters', () => {
    expect(passwordProblem('short')).toBe('Password must be at least 12 characters.');
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(passwordProblem('elevenchars')).not.toBeNull();
    expect(passwordProblem('twelve-chars')).toBeNull();
  });

  it('refuses an absurd length', () => {
    expect(passwordProblem('a'.repeat(129))).toBe('That password is too long.');
  });
});

describe('checkPasswordBreach', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends only five hash characters and nothing of the password', async () => {
    const password = 'zebra-canopy-lantern-91';
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const calls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      calls.push(url);
      return Promise.resolve(
        new Response(`${sha1.slice(5)}:7\r\n0000000000000000000000000000000000:3`, { status: 200 }),
      );
    });

    const verdict = await checkPasswordBreach(password);
    expect(verdict.breached).toBe(true);
    expect(verdict.unavailable).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`);
    expect(calls[0]).not.toContain(password);
    expect(calls[0]).not.toContain(sha1.slice(5));
  });

  it('treats an unknown hash as safe', async () => {
    const password = 'a-different-passphrase-42';
    vi.stubGlobal('fetch', () =>
      Promise.resolve(new Response('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5', { status: 200 })),
    );
    const verdict = await checkPasswordBreach(password);
    expect(verdict.breached).toBe(false);
    expect(verdict.unavailable).toBe(false);
  });

  it('fails open when the list cannot be reached, and says it could not tell', async () => {
    const password = 'network-goes-wrong-7742';
    vi.stubGlobal('fetch', () => Promise.reject(new Error('getaddrinfo ENOTFOUND')));
    const verdict = await checkPasswordBreach(password);
    expect(verdict.breached).toBe(false);
    expect(verdict.unavailable).toBe(true);
  });

  it('fails open on a non-200 answer too', async () => {
    const password = 'upstream-says-500-1188';
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('nope', { status: 500 })));
    const verdict = await checkPasswordBreach(password);
    expect(verdict.breached).toBe(false);
    expect(verdict.unavailable).toBe(true);
  });
});
