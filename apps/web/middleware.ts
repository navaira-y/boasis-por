import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { decideGate, isPortalPath, type SubscriptionStatus } from '@/lib/gate';
import { cleanEnvValue } from '@/lib/env-value';
import { fetchWithTimeout } from '@/lib/fetch-timeout';
import { portalCsp } from '@/lib/csp';

/**
 * The gate in front of the portal.
 *
 * /portal and /portal/* are STATIC files inside public/: no page code runs for
 * them, so this middleware is their only gate, which is why the matcher lists
 * the bare path as well as the subtree. Fail closed: with no configuration
 * there is no session to prove, so nobody walks into a customer's file.
 *
 * The subscription is read with the VISITOR'S OWN cookies, never the service
 * key, so the gate keeps working even when a key is misconfigured.
 *
 * No server-only imports here: middleware runs in the edge runtime.
 */
/**
 * Runtime read by computed name on purpose: Next inlines
 * `process.env.NEXT_PUBLIC_X` at build time, and these two values must come
 * from the running container, never from whatever was set when the image was
 * built.
 */
function env(name: string): string | undefined {
  return process.env[name];
}

export async function middleware(request: NextRequest) {
  const url = cleanEnvValue(env('NEXT_PUBLIC_SUPABASE_URL'));
  const anonKey = cleanEnvValue(env('NEXT_PUBLIC_SUPABASE_ANON_KEY'));

  let response = NextResponse.next({ request });

  if (url === null || anonKey === null) {
    // Nothing can be verified without configuration: send them to sign-in,
    // which names the problem instead of leaking the portal.
    const fallback = request.nextUrl.clone();
    fallback.pathname = '/signin';
    fallback.search = '';
    return NextResponse.redirect(fallback);
  }

  const supabase = createServerClient(url, anonKey, {
    // The gate decides in a bounded time, even when the project is unreachable.
    global: { fetch: fetchWithTimeout() },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Fail closed on ANY failure below: an unreachable project, a rotated key or
  // an expired token all end at sign-in, never with a 500 and never with an
  // open door. Reading the subscription with the visitor's own session also
  // means the gate keeps working when the service key is misconfigured.
  let user: { id: string; email_confirmed_at?: string | null } | null = null;
  let status: SubscriptionStatus | null = null;
  try {
    const result = await supabase.auth.getUser();
    const value = result.data.user;
    user =
      value === null
        ? null
        : { id: value.id, email_confirmed_at: value.email_confirmed_at ?? null };

    if (user !== null && user.email_confirmed_at !== null) {
      const { data } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('profile_id', user.id)
        .maybeSingle();
      const raw = (data as { status?: unknown } | null)?.status;
      status = typeof raw === 'string' ? (raw as SubscriptionStatus) : null;
    }
  } catch {
    user = null;
    status = null;
  }

  const action = decideGate({
    path: request.nextUrl.pathname,
    signedIn: user !== null,
    emailConfirmed: user !== null && user.email_confirmed_at !== null,
    status,
  });

  if (action === 'allow') {
    // The portal bundle signs in with a session cookie its own JavaScript can
    // read (that is how the team's portal is built), so the pages it is served
    // on get a policy that allows only this site's scripts, the font hosts the
    // shell links, and Supabase itself.
    if (isPortalPath(request.nextUrl.pathname)) {
      response.headers.set('Content-Security-Policy', portalCsp(url));
    }
    return response;
  }

  const target = request.nextUrl.clone();
  target.search = '';
  if (action === 'to-signin') {
    target.pathname = '/signin';
    target.searchParams.set('next', request.nextUrl.pathname);
  } else if (action === 'to-signup') {
    target.pathname = '/signup';
  } else {
    target.pathname = '/billing';
  }

  const redirect = NextResponse.redirect(target);
  // Carry any refreshed session cookies onto the redirect, or a visitor whose
  // token rolled over during this request would be bounced back to sign-in.
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  // The bare /portal is listed on purpose: it is a static file, so without a
  // match here nothing at all would check the visitor.
  matcher: ['/portal', '/portal/:path*', '/billing', '/billing/:path*'],
};
