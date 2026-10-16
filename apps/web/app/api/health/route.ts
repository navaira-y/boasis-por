import { NextResponse, type NextRequest } from 'next/server';
import { runHealth } from '@/lib/diagnose';
import { checkLimit, clientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * The one URL that answers "why is signup not working".
 *
 * It returns booleans, HTTP statuses, project references (public: they are in
 * the project URL and in every anon key) and masked addresses. Never a key,
 * never a token. 200 when the entry flow has everything it needs, 503 when a
 * blocker is named, so an uptime monitor notices too.
 */
export async function GET(request: NextRequest) {
  const verdict = checkLimit('healthIp', clientIp(request.headers));
  if (!verdict.ok) {
    return NextResponse.json({ error: 'too many requests' }, { status: 429 });
  }
  const fresh = request.nextUrl.searchParams.get('fresh') === '1';
  const report = await runHealth({ fresh, withEvents: true });
  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
