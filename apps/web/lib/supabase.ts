import { createBrowserClient } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function publicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase public env vars");
  return { url, anon };
}

/** Browser client (anon key + RLS). Safe for client components. */
export function createBrowserSupabase(): SupabaseClient {
  const { url, anon } = publicEnv();
  return createBrowserClient(url, anon);
}

/** Server client (anon key + RLS, reads the request session). */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const { url, anon } = publicEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setAll: (cookiesToSet: { name: string; value: string; options?: any }[]) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a server component (read-only cookies) — middleware
          // refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Admin client (service-role key, BYPASSES RLS).
 * SERVER ONLY — throws outside server code. Every use must be justified:
 * profiles, subscriptions, webhooks, audit. Never for plain user reads.
 */
export async function createAdminSupabase(): Promise<SupabaseClient> {
  const { url } = publicEnv();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  await import("server-only");
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
