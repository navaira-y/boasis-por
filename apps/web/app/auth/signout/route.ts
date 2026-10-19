import { sameOriginSecurityRequest } from '@/lib/security-origin';
import { NextResponse, type NextRequest } from 'next/server';
import { serverSupabase } from '@/lib/supabase';

/** Sign out. POST only: a bare link must never end someone's session. */
export async function POST(request: NextRequest) {
  if (!sameOriginSecurityRequest(request))
    return new NextResponse('Sign out must be requested from this site.', { status: 403 });
  const supabase = await serverSupabase();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error !== null)
    return new NextResponse('Could not confirm sign out. Please try again.', { status: 503 });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: '/signin', 'Cache-Control': 'no-store' },
  });
}
