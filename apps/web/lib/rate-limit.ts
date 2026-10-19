/**
 * Fixed-window limiter for the entry surface (email checks, code sends, code
 * checks, sign-in, activation). In-process: correct for the single replica we
 * run today, and deliberately behind one interface so the shared Redis the
 * stack already includes can take over when a second replica exists
 * (Railway, numReplicas = 1 until then).
 */

export interface RateVerdict {
  ok: boolean;
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): RateVerdict {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (bucket === undefined || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSeconds: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSeconds: 0 };
}

/** Keeps the map from growing without bound under a slow attack. */
export function sweepRateLimits(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Test hook. */
export function resetRateLimits(): void {
  buckets.clear();
}

export const LIMITS = {
  entryEmail: { limit: 10, windowMs: 3_600_000 },
  entryIp: { limit: 30, windowMs: 3_600_000 },
  otpSendEmail: { limit: 5, windowMs: 3_600_000 },
  otpSendIp: { limit: 20, windowMs: 3_600_000 },
  otpVerify: { limit: 10, windowMs: 600_000 },
  signInIp: { limit: 20, windowMs: 600_000 },
  mfaManage: { limit: 20, windowMs: 600_000 },
  activateIp: { limit: 10, windowMs: 60_000 },
  wishEmail: { limit: 20, windowMs: 3_600_000 },
  healthIp: { limit: 30, windowMs: 60_000 },
} as const;

export type LimitName = keyof typeof LIMITS;

export function checkLimit(name: LimitName, subject: string): RateVerdict {
  const { limit, windowMs } = LIMITS[name];
  return rateLimit(`${name}:${subject}`, limit, windowMs);
}

/** First hop of x-forwarded-for, which is what the platform sets. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  if (first !== undefined && first.length > 0) return first;
  return headers.get('x-real-ip')?.trim() ?? 'unknown';
}
