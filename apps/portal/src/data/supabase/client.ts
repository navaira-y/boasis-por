import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// One browser client for the Supabase data layer. Cookie storage (not localStorage) on
// purpose: the Next.js app signs the user in with the same cookies, so when the portal is
// served same-origin behind the pay gate it is already signed in as the payer. No token is
// ever handed through a URL or a prop.
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (client === null) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (url === undefined || url === '' || anonKey === undefined || anonKey === '') {
      throw new Error(
        'The Supabase data layer needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
      );
    }
    client = createBrowserClient(url, anonKey);
  }
  return client;
}
