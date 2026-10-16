import { NextResponse, type NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { adminSupabaseOrNull } from '@/lib/supabase';
import { readServiceKey } from '@/lib/env';
import { runRenewalSweep } from '@/lib/renewals';
import { checkLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * Daily renewal sweep: records the 30/14/7/1-day reminders that are due and
 * pauses a subscription whose period has ended (which is what locks /portal
 * and sends the visitor to /billing).
 *
 * Sending is not here yet: SMTP arrives with support@boasis.ae. Every reminder
 * is recorded with its recipient, so switching sending on changes one file.
 *
 * Protected by the service key as a bearer token, which nobody hostile has,
 * and answered with 404 otherwise so the endpoint does not advertise itself.
 */
function authorized(request: NextRequest): boolean {
  const expected = readServiceKey();
  if (expected === null) return false;
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token.length === 0) return false;
  const a = createHash('sha256').update(token).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse('Not found', { status: 404 });
  const verdict = checkLimit('healthIp', request.headers.get('x-forwarded-for') ?? 'cron');
  if (!verdict.ok) return NextResponse.json({ error: 'too many requests' }, { status: 429 });

  const admin = adminSupabaseOrNull();
  if (admin === null) {
    return NextResponse.json(
      { ok: false, code: 'ENV_SERVICE_MISSING', message: 'Set SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 },
    );
  }

  try {
    const result = await runRenewalSweep(admin);
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error(`renewal sweep failed: ${message}`);
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }
}
