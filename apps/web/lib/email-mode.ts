import 'server-only';
import { readPublicEnv } from './env';
import { knownCodeLength } from './code-length';

/**
 * What the project says about its own auth settings, and why we believe it.
 *
 * The app asks Supabase's public auth settings (`/auth/v1/settings`, meant to be
 * public and carrying no secret) for two things: how long the codes are, and
 * whether the project has a sender of its own. The second is not reliable on
 * every project, and the report says so rather than pretending:
 *
 *   the request answered      -> the length is used exactly, and the KEY NAMES it
 *                               carried are listed (names only, never values)
 *   the request did not answer -> the length is unknown, and the entry screen
 *                               draws six boxes that grow while the visitor types,
 *                               with no automatic submit. Guessing here is what
 *                               told a visitor with an eight-digit code to type
 *                               six, so nothing is guessed any more.
 *
 * Everything the health report shows from this probe is a status, a short reason
 * and configuration field NAMES. No key, no token, no value is ever kept.
 */

export interface EmailSettingsProbe {
  /** The HTTP status, or 0 when the request never came back. */
  status: number;
  /** True when a response arrived, was ok, and parsed as an object. */
  ok: boolean;
  /** A short reason when not ok: the fetch error, or the endpoint's own message. */
  note: string | null;
  /** The setting names the response carried. Names only, never values. */
  fields: string[];
  /** The sender-related names among them, which is what "own sender" needs. */
  senderFields: string[];
}

export interface EmailMode {
  /** The length the project reports, when it reports a usable one. */
  otpLength: number | null;
  /**
   * The number of boxes to draw, or null when the project did not say. Null means
   * "any length could arrive", not "six" (see lib/code-length).
   */
  codeLength: number | null;
  /** True when the settings named a sender of the project's own. */
  ownSender: boolean;
  /** Why the read came out the way it did, for the health report. */
  settings: EmailSettingsProbe;
}

/** Names that would mean the project has a sender of its own configured. */
const SENDER_FIELDS = ['smtp_admin_email', 'smtp_host', 'smtp_sender_name', 'smtp_port', 'smtp_user'];

/** How many setting names the report keeps. The list is for reading, not parsing. */
const MAX_FIELDS = 40;
/** How much of a reason is kept. Long enough to recognise, short enough to skim. */
const MAX_NOTE = 160;

const CACHE_MS = 60_000;
let cache: { at: number; mode: EmailMode } | null = null;

const UNREADABLE: EmailSettingsProbe = {
  status: 0,
  ok: false,
  note: 'the request to /auth/v1/settings did not come back',
  fields: [],
  senderFields: [],
};

export async function readEmailMode(): Promise<EmailMode> {
  const now = Date.now();
  if (cache !== null && now - cache.at < CACHE_MS) return cache.mode;

  let otpLength: number | null = null;
  let ownSender = false;
  let settings: EmailSettingsProbe = UNREADABLE;

  try {
    const { url, anonKey } = readPublicEnv();
    // Both headers, the same pair every working read in this app uses: the
    // apikey identifies the project, the bearer token is what the gateway
    // expects when a route asks for one.
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });

    if (response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const parsed = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null;
      if (parsed === null) {
        settings = { status: response.status, ok: false, note: 'the answer was not readable JSON', fields: [], senderFields: [] };
      } else {
        const fields = Object.keys(parsed).slice(0, MAX_FIELDS);
        const senderFields = SENDER_FIELDS.filter((field) => {
          const value = Reflect.get(parsed, field);
          return (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number';
        });
        // Supabase does not promise every field on every project version, so each
        // one is narrowed by name and treated as unknown until it proves itself.
        const rawLength: unknown = Reflect.get(parsed, 'mailer_otp_length');
        otpLength = typeof rawLength === 'number' ? rawLength : null;
        ownSender = senderFields.length > 0;
        settings = { status: response.status, ok: true, note: null, fields, senderFields };
      }
    } else {
      // The endpoint's own message, and only that: it explains a refused key far
      // better than a status number alone, and it never contains the key.
      const said = await response.text().catch(() => '');
      settings = {
        status: response.status,
        ok: false,
        note: shortReason(response.status, said),
        fields: [],
        senderFields: [],
      };
    }
  } catch (error) {
    settings = {
      ...UNREADABLE,
      note: (error instanceof Error ? error.message : String(error)).slice(0, MAX_NOTE),
    };
  }

  const mode: EmailMode = { otpLength, codeLength: knownCodeLength(otpLength), ownSender, settings };
  cache = { at: now, mode };
  return mode;
}

/** A one-line reason from a refused response: its own `message` field when there is one. */
function shortReason(status: number, body: string): string {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null) {
      const message: unknown = Reflect.get(parsed as Record<string, unknown>, 'message');
      if (typeof message === 'string' && message.trim() !== '') {
        return `${String(status)}: ${message.trim()}`.slice(0, MAX_NOTE);
      }
    }
  } catch {
    // Not JSON: fall through to the plain status.
  }
  return `${String(status)}: the endpoint refused the request`;
}

/** Test and operator hook: forget the cached answer. */
export function resetEmailModeCache(): void {
  cache = null;
}
