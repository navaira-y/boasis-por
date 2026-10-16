import 'server-only';
import { readPublicEnv } from './env';

/**
 * Does the project have a real sender yet?
 *
 * The app asks Supabase's own public auth settings (they are meant to be public
 * and carry no secret), which report the configured SMTP sender and the OTP
 * length. That way the screen follows the truth instead of a switch somebody has
 * to keep in step:
 *
 *   a real sender configured -> the email can carry a six-digit code, so the
 *                               code screen is offered (the link still works)
 *   no sender yet            -> the built-in mailer sends a link only, so the
 *                               screen asks for the click instead of for digits
 *                               that are not in the email
 *
 * Every failure falls back to the link-led screen, which is the state this
 * project is in until support@boasis.ae is connected.
 */

export interface EmailMode {
  /** True when the email is expected to carry a six-digit code. */
  codeLed: boolean;
  /** True when the project has a sender of its own configured. */
  ownSender: boolean;
  /** The project's configured code length, when it reports one. */
  otpLength: number | null;
}

const FALLBACK: EmailMode = { codeLed: false, ownSender: false, otpLength: null };
const CACHE_MS = 60_000;
let cache: { at: number; mode: EmailMode } | null = null;

export async function readEmailMode(): Promise<EmailMode> {
  const now = Date.now();
  if (cache !== null && now - cache.at < CACHE_MS) return cache.mode;

  let mode = FALLBACK;
  try {
    const { url, anonKey } = readPublicEnv();
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey },
      cache: 'no-store',
    });
    if (response.ok) {
      const body: unknown = await response.json();
      const settings: Record<string, unknown> =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const ownSender = namesSender(settings);
      // Supabase does not promise every field on every project version, so the
      // whole settings object is narrowed once, by name, and treated as unknown
      // until it proves otherwise.
      const rawLength: unknown = Reflect.get(settings, 'mailer_otp_length');
      const otpLength = typeof rawLength === 'number' ? rawLength : null;
      // A code needs a working sender; without one the email carries a link.
      const codeLed = ownSender && otpLength !== null && otpLength >= 6;
      mode = { codeLed, ownSender, otpLength };
    }
  } catch {
    mode = FALLBACK;
  }
  cache = { at: now, mode };
  return mode;
}

/** True when the settings name a sender of the project's own. */
function namesSender(settings: Record<string, unknown>): boolean {
  for (const field of ['smtp_admin_email', 'smtp_host', 'smtp_sender_name']) {
    const value = settings[field];
    if (typeof value === 'string' && value.trim().length > 0) return true;
  }
  return false;
}

/** Test and operator hook: forget the cached answer. */
export function resetEmailModeCache(): void {
  cache = null;
}
