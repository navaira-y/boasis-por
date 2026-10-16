import { NextResponse, type NextRequest } from 'next/server';
import { serverSupabase } from '@/lib/supabase';
import { routeForUser } from '@/lib/access';
import { logEntryEvent } from '@/lib/log';

/**
 * Where the link inside the email lands.
 *
 * The link verifies the inbox, so the visitor arrives already proven and the
 * code step is skipped: they carry on at the password screen (/signup resumes
 * there by itself). Both link shapes Supabase can send are handled, and an
 * already-used or expired link gets a clear sentence instead of an error page.
 */
export async function GET(request: NextRequest) {
  const supabase = await serverSupabase();
  const url = new URL(request.url);

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const failure =
    url.searchParams.get('error_description') ?? url.searchParams.get('error') ?? null;

  if (failure !== null) {
    console.error(`auth callback refused the link: ${failure}`);
    return NextResponse.redirect(new URL('/signup?link=expired', request.url));
  }

  let verified = false;
  if (code !== null && code.length > 0) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = error === null;
    if (error !== null) console.error(`auth callback: code exchange failed: ${error.message}`);
  } else if (tokenHash !== null && tokenHash.length > 0) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: (type ?? 'email') as 'email' | 'signup' | 'recovery' | 'magiclink' | 'invite',
    });
    verified = error === null;
    if (error !== null) console.error(`auth callback: token check failed: ${error.message}`);
  }

  if (!verified) {
    return NextResponse.redirect(new URL('/signup?link=expired', request.url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email == null) {
    return NextResponse.redirect(new URL('/signup?link=expired', request.url));
  }
  await logEntryEvent({ kind: 'code_verified', email: user.email, code: 'LINK' });

  // No profile yet: finish the entry flow at the password step.
  const next = await routeForUser(supabase, user.id);
  return NextResponse.redirect(new URL(next, request.url));
}
