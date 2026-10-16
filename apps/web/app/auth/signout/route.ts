import { NextResponse, type NextRequest } from 'next/server';
import { serverSupabase } from '@/lib/supabase';

/** Sign out. POST only: a bare link must never end someone's session. */
export async function POST(request: NextRequest) {
  const supabase = await serverSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/signin', request.url), { status: 303 });
}
