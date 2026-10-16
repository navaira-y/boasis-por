/**
 * The Content Security Policy for the portal bundle.
 *
 * Why the portal specifically: the session cookie is readable by JavaScript on
 * purpose. The team's portal runs in the browser and signs in with it (that is
 * how it is built, and it is not being restyled or rebuilt), so a script that
 * manages to run inside /portal can read the session. A policy that only allows
 * this site's own scripts, the two Google Fonts hosts the shell links, and
 * Supabase itself is the cheapest real protection against that.
 *
 * Every origin below is here because the built bundle needs it, not by habit:
 *   fonts.googleapis.com   the Poppins stylesheet in the portal shell
 *   fonts.gstatic.com      the font files that stylesheet points at
 *   blob:                  the portal downloads documents it holds in memory
 *                          (createObjectURL), and images built from them
 *   wss://<project>        the portal's live subscription to Supabase changes
 *   <project>              its REST calls
 *   api.pwnedpasswords.com the leaked-password check the portal runs itself
 *                          (k-anonymity: five hash characters leave)
 *
 * `'unsafe-inline'` is allowed for STYLES only (the shell and React set style
 * attributes). Scripts get no such allowance, and there is no `'unsafe-eval'`,
 * so injected script text cannot run.
 *
 * Pure module: middleware runs in the edge runtime and imports this.
 */

const FONTS_STYLE = 'https://fonts.googleapis.com';
const FONTS_FILES = 'https://fonts.gstatic.com';
/** The portal runs its own breach check (the signup path runs the server's). */
const BREACH_CHECK = 'https://api.pwnedpasswords.com';

/** https://host and wss://host, from the Supabase project URL (or null). */
function supabaseOrigins(supabaseUrl: string | null): string[] {
  if (supabaseUrl === null) return [];
  try {
    const url = new URL(supabaseUrl);
    const socketProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return [url.origin, `${socketProtocol}//${url.host}`];
  } catch {
    return [];
  }
}

export function portalCsp(supabaseUrl: string | null): string {
  const connect = ["'self'", ...supabaseOrigins(supabaseUrl), BREACH_CHECK];
  const directives: Record<string, string[]> = {
    // Anything not named below falls back to this: only this origin.
    'default-src': ["'self'"],
    // No <base> rewriting, no plugins, no framing by another site.
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'self'"],
    // Forms on the portal post to the portal (or to Supabase auth directly).
    'form-action': ["'self'", ...supabaseOrigins(supabaseUrl)],
    // The rule that matters: scripts come from this origin and nowhere else.
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'", FONTS_STYLE],
    'font-src': ["'self'", FONTS_FILES],
    'img-src': ["'self'", 'data:', 'blob:'],
    'media-src': ["'self'", 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'connect-src': connect,
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}
