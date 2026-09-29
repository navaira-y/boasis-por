/**
 * Minimal fixed-window limiter for auth-adjacent routes (checkout, webhooks).
 * Single-instance only — TODO (M6): move to Redis when a second instance exists.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit = 20,
  windowMs = 60_000
): { ok: boolean; retryAfterMs: number } {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterMs: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) return { ok: false, retryAfterMs: entry.resetAt - now };
  return { ok: true, retryAfterMs: 0 };
}
