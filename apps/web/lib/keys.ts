/**
 * Reads the FACTS out of a Supabase key without ever logging or returning the
 * key itself. Only the project reference, the role and the format are exposed,
 * and the project reference is public: it is part of the project URL and of
 * every anon key shipped in a browser bundle.
 *
 * This is what makes "the key is real but the check fails" a one-line answer:
 *   - a key from another project (ref mismatch),
 *   - an anon/publishable key pasted where the service key belongs (role),
 *   - a service key pasted into the anon slot (a privilege leak),
 *   - a value that is not a Supabase key at all.
 */

export type KeyFormat = 'jwt' | 'sb_secret' | 'sb_publishable' | 'unknown' | 'absent';

export interface KeyFacts {
  format: KeyFormat;
  /** Project reference the key belongs to, when it can be read. */
  ref: string | null;
  /** 'service_role' | 'anon' | null when the format carries no role. */
  role: string | null;
  expiresAt: string | null;
  /** Length only. Never the value, never a prefix long enough to matter. */
  length: number;
}

export const ABSENT_KEY: KeyFacts = {
  format: 'absent',
  ref: null,
  role: null,
  expiresAt: null,
  length: 0,
};

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function readKeyFacts(key: string | null | undefined): KeyFacts {
  if (key === null || key === undefined || key.trim().length === 0) return ABSENT_KEY;
  const trimmed = key.trim();

  // New-style keys (Supabase dashboard, 2025 onwards) are opaque strings.
  if (trimmed.startsWith('sb_secret_')) {
    return { format: 'sb_secret', ref: null, role: 'service_role', expiresAt: null, length: trimmed.length };
  }
  if (trimmed.startsWith('sb_publishable_')) {
    return { format: 'sb_publishable', ref: null, role: 'anon', expiresAt: null, length: trimmed.length };
  }

  const parts = trimmed.split('.');
  if (parts.length === 3) {
    const payload = decodeSegment(parts[1] ?? '');
    if (payload !== null) {
      return {
        format: 'jwt',
        ref: asString(payload.ref),
        role: asString(payload.role),
        expiresAt: typeof payload.exp === 'number' ? new Date(payload.exp * 1000).toISOString() : null,
        length: trimmed.length,
      };
    }
  }

  // Legacy JWT-shaped keys that failed to decode (truncated paste, wrong value).
  return { format: 'unknown', ref: null, role: null, expiresAt: null, length: trimmed.length };
}

export interface UrlFacts {
  ok: boolean;
  /** https://<ref>.supabase.co */
  ref: string | null;
  host: string | null;
  problem: 'empty' | 'not-a-url' | 'not-https' | 'has-path' | 'not-supabase' | null;
}

export function readUrlFacts(url: string | null | undefined): UrlFacts {
  if (url === null || url === undefined || url.trim().length === 0) {
    return { ok: false, ref: null, host: null, problem: 'empty' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { ok: false, ref: null, host: null, problem: 'not-a-url' };
  }
  const loopback =
    parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
  if (parsed.protocol !== 'https:' && !(loopback && parsed.protocol === 'http:')) {
    return { ok: false, ref: null, host: parsed.host, problem: 'not-https' };
  }
  // A trailing slash is fine; a path is not (that is a dashboard page URL).
  const path = parsed.pathname.replace(/\/+$/, '');
  if (path.length > 0) {
    return { ok: false, ref: null, host: parsed.host, problem: 'has-path' };
  }
  // A local Supabase (http://127.0.0.1:54321, and the test harness) has no
  // project reference to compare keys against: accepted, ref stays unknown.
  if (loopback && parsed.protocol === 'http:') {
    return { ok: true, ref: null, host: parsed.host, problem: null };
  }
  const match = /^([a-z0-9-]+)\.supabase\.(co|in)$/i.exec(parsed.host);
  const ref = match === null ? null : match[1];
  if (ref === null || ref === undefined) {
    return { ok: false, ref: null, host: parsed.host, problem: 'not-supabase' };
  }
  return { ok: true, ref, host: parsed.host, problem: null };
}
