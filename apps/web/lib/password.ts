import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Password policy: at least 12 characters (spec step 0) and refused when the
 * password is already in a known leak. The breach check uses HaveIBeenPwned
 * k-anonymity: only the first 5 characters of the SHA-1 hash ever leave this
 * server, and the password itself never does.
 */

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${String(PASSWORD_MIN_LENGTH)} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) return 'That password is too long.';
  return null;
}

export interface BreachVerdict {
  breached: boolean;
  /** True when the list could not be reached: we fail open on purpose. */
  unavailable: boolean;
}

const prefixCache = new Map<string, { body: string; at: number }>();
const PREFIX_TTL_MS = 86_400_000;

export async function checkPasswordBreach(
  password: string,
  timeoutMs = 4000,
): Promise<BreachVerdict> {
  const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  const cached = prefixCache.get(prefix);
  if (cached !== undefined && Date.now() - cached.at < PREFIX_TTL_MS) {
    return { breached: cached.body.includes(suffix), unavailable: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      signal: controller.signal,
      headers: { 'Add-Padding': 'true' },
      cache: 'no-store',
    });
    if (!response.ok) return { breached: false, unavailable: true };
    const body = await response.text();
    prefixCache.set(prefix, { body, at: Date.now() });
    if (prefixCache.size > 200) {
      const oldest = prefixCache.keys().next();
      if (!oldest.done) prefixCache.delete(oldest.value);
    }
    return { breached: body.includes(suffix), unavailable: false };
  } catch {
    // Availability wins here: length + the inbox code carry the weight, and
    // blocking signups because a third party is down would be worse.
    return { breached: false, unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}
