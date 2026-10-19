import { sameOriginSecurityRequest } from '@/lib/security-origin';
import { NextResponse, type NextRequest } from 'next/server';
import { MfaOperation, MfaReply } from '@boasis/schema';
import { serverSupabase } from '@/lib/supabase';
import { clientIp } from '@/lib/rate-limit';
import { MfaFailure, securityMfa } from '@/lib/mfa-service';

export const dynamic = 'force-dynamic';

function reply(value: MfaReply, status = 200): NextResponse {
  return NextResponse.json(MfaReply.parse(value), {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function run(request: NextRequest, mutation: boolean): Promise<NextResponse> {
  try {
    let operation = null;
    if (mutation) {
      if (
        !sameOriginSecurityRequest(request) ||
        request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json'
      ) {
        return reply(
          { ok: false, code: 'INVALID', error: 'This security request must come from this site.' },
          403,
        );
      }
      // Bound the body before parsing; never accept arbitrary JSON or log codes.
      const reader = request.body?.getReader();
      if (reader === undefined)
        return reply({ ok: false, code: 'INVALID', error: 'A security action is required.' }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 2048) {
          await reader.cancel();
          return reply(
            { ok: false, code: 'INVALID', error: 'Security request is too large.' },
            413,
          );
        }
        chunks.push(part.value);
      }
      let payload: unknown;
      try {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reply(
          { ok: false, code: 'INVALID', error: 'A valid security action is required.' },
          400,
        );
      }
      const parsed = MfaOperation.safeParse(payload);
      if (!parsed.success)
        return reply(
          {
            ok: false,
            code: 'INVALID',
            error: 'Check the authenticator selection and six-digit code.',
          },
          400,
        );
      operation = parsed.data;
    }
    const client = await serverSupabase();
    return reply(await securityMfa(client, operation, clientIp(request.headers)));
  } catch (error) {
    if (error instanceof MfaFailure) {
      const status = {
        AUTH_REQUIRED: 401,
        MFA_REQUIRED: 403,
        INVALID: 400,
        RATE_LIMITED: 429,
        UNAVAILABLE: 503,
      }[error.code];
      return reply({ ok: false, code: error.code, error: error.message }, status);
    }
    return reply(
      {
        ok: false,
        code: 'UNAVAILABLE',
        error: 'Could not confirm your security status. Reload and check before trying again.',
      },
      503,
    );
  }
}

export function GET(request: NextRequest) {
  return run(request, false);
}
export function POST(request: NextRequest) {
  return run(request, true);
}
