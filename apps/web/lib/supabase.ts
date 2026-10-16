import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { readPublicEnv, readServiceKey } from './env';
import { fetchWithTimeout } from './fetch-timeout';

/**
 * Three clients, three jobs:
 *
 *   serverSupabase()  anon key + the visitor's own cookies, so RLS runs as
 *                     that visitor. This is what every user-facing read uses.
 *   adminSupabase()   service key, bypasses RLS. Server only, never imported
 *                     from a client component, never sent anywhere.
 *
 * There is no browser client in this app on purpose: the entry flow is server
 * actions end to end, so neither the service key nor the anon key is ever
 * referenced by client code here. (The portal bundle carries its own anon key,
 * protected by RLS, as the architecture requires.)
 */

export async function serverSupabase() {
  const { url, anonKey } = readPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    // Bounded: a page must never wait through Supabase's retry backoff.
    global: { fetch: fetchWithTimeout() },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called while rendering a server component: the response cookies are
          // already sealed. Middleware refreshes the session for those paths.
        }
      },
    },
  });
}

export class ServiceKeyMissingError extends Error {
  constructor() {
    super('SUPABASE_SERVICE_ROLE_KEY is not set on this service');
    this.name = 'ServiceKeyMissingError';
  }
}

export function serviceKey(): string {
  const key = readServiceKey();
  if (key === null) throw new ServiceKeyMissingError();
  return key;
}

export function hasServiceKey(): boolean {
  return readServiceKey() !== null;
}

/**
 * The client types this app passes around, DERIVED from the factories so they
 * can never drift from the libraries that produce them.
 */
export type VisitorDbClient = Awaited<ReturnType<typeof serverSupabase>>;
export type AdminDbClient = ReturnType<typeof adminSupabase>;

/** Service-role client. Justify every call site: this bypasses RLS. */
export function adminSupabase() {
  const { url } = readPublicEnv();
  return createClient(url, serviceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchWithTimeout() },
  });
}

/** Service-role client or null, for paths that must keep working without it. */
export function adminSupabaseOrNull(): AdminDbClient | null {
  try {
    return adminSupabase();
  } catch {
    return null;
  }
}
