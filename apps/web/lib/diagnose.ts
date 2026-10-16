import 'server-only';
import { envPresence, readPublicEnv, readServiceKey, type EnvPresence } from './env';
import { readKeyFacts, readUrlFacts, type KeyFormat } from './keys';

/**
 * The probe suite behind /api/health and behind every named signup failure.
 *
 * Why it exists: "Could not check that email" told nobody anything. Every
 * failure path here ends with a CODE, a sentence and a fix, so the founder can
 * read one line and know what to change. It also runs the checks nobody wants
 * to run by hand: the private tables are read with the PUBLIC key, and a table
 * that answers an anonymous caller is reported as a leak.
 *
 * Nothing secret is ever returned or logged: booleans, HTTP statuses, project
 * references (public: they are in the project URL and in every anon key) and
 * masked emails only.
 */

export type HealthCode =
  | 'OK'
  | 'ENV_URL_MISSING'
  | 'ENV_ANON_MISSING'
  | 'ENV_SERVICE_MISSING'
  | 'URL_MALFORMED'
  | 'ANON_NOT_ANON'
  | 'ANON_URL_MISMATCH'
  | 'SERVICE_NOT_SERVICE'
  | 'SERVICE_KEY_UNREADABLE'
  | 'SERVICE_URL_MISMATCH'
  | 'DB_UNREACHABLE'
  | 'ANON_KEY_REJECTED'
  | 'SERVICE_KEY_REJECTED'
  | 'LIST_TABLE_MISSING'
  | 'EVENTS_TABLE_MISSING'
  | 'ACTIVATION_FUNCTION_MISSING'
  | 'SERVICE_SCHEMA_UNREADABLE'
  | 'LIST_EMPTY_UNVERIFIED'
  | 'SENSITIVE_TABLE_PUBLIC';

export type Severity = 'blocker' | 'warning' | 'note';

export interface CodeMeaning {
  severity: Severity;
  /** One line, plain language, no jargon. */
  title: string;
  /** What the operator changes. */
  fix: string;
}

export const HEALTH_CODES: Record<HealthCode, CodeMeaning> = {
  OK: {
    severity: 'note',
    title: 'Everything the entry flow needs is in place.',
    fix: 'Nothing to do.',
  },
  ENV_URL_MISSING: {
    severity: 'blocker',
    title: 'NEXT_PUBLIC_SUPABASE_URL is not set on this service.',
    fix: 'Railway, Variables: add NEXT_PUBLIC_SUPABASE_URL with the project URL, then redeploy.',
  },
  ENV_ANON_MISSING: {
    severity: 'blocker',
    title: 'NEXT_PUBLIC_SUPABASE_ANON_KEY is not set on this service.',
    fix: 'Railway, Variables: add NEXT_PUBLIC_SUPABASE_ANON_KEY from Supabase, Settings, API keys.',
  },
  ENV_SERVICE_MISSING: {
    severity: 'blocker',
    title: 'SUPABASE_SERVICE_ROLE_KEY is not set on this service.',
    fix: 'Railway, Variables: add the service_role key from Supabase, Settings, API keys. Until then every early-access address reads as not listed, so nobody gets the waitlist door.',
  },
  URL_MALFORMED: {
    severity: 'blocker',
    title: 'NEXT_PUBLIC_SUPABASE_URL is not a project URL.',
    fix: 'It must be exactly https://<project-ref>.supabase.co with no path and no quotes.',
  },
  ANON_NOT_ANON: {
    severity: 'blocker',
    title: 'The anon slot holds a service_role or secret key.',
    fix: 'That key would ship to every browser inside the portal bundle. Replace NEXT_PUBLIC_SUPABASE_ANON_KEY with the anon (publishable) key and rotate the exposed secret in Supabase.',
  },
  ANON_URL_MISMATCH: {
    severity: 'blocker',
    title: 'The anon key belongs to a different Supabase project than the URL.',
    fix: 'Copy both from the same project page in Supabase, Settings, API keys.',
  },
  SERVICE_NOT_SERVICE: {
    severity: 'blocker',
    title: 'The service key slot holds a low-privilege key, so the early-access list reads empty.',
    fix: 'Put the service_role key (or an sb_secret key) in SUPABASE_SERVICE_ROLE_KEY.',
  },
  SERVICE_KEY_UNREADABLE: {
    severity: 'blocker',
    title: 'SUPABASE_SERVICE_ROLE_KEY is not a readable Supabase key.',
    fix: 'Re-copy the service_role key: the stored value is truncated or not a key at all.',
  },
  SERVICE_URL_MISMATCH: {
    severity: 'blocker',
    title: 'The service key belongs to a different Supabase project than the URL.',
    fix: 'A key from another project is the classic "the key is real but nothing works". Copy both values from the same project.',
  },
  DB_UNREACHABLE: {
    severity: 'blocker',
    title: 'The app cannot reach Supabase at all.',
    fix: 'Check the project URL and that the Supabase project is running (free projects pause when idle).',
  },
  ANON_KEY_REJECTED: {
    severity: 'blocker',
    title: 'Supabase rejected the anon key.',
    fix: 'Supabase, Settings, API keys: copy the anon (publishable) key again. If it was rotated, update Railway too.',
  },
  SERVICE_KEY_REJECTED: {
    severity: 'blocker',
    title: 'Supabase rejected the service key.',
    fix: 'It was rotated or revoked. Copy the current service_role key into Railway.',
  },
  LIST_TABLE_MISSING: {
    severity: 'blocker',
    title: 'The early-access list is missing from this database.',
    fix: 'Supabase, SQL editor: run supabase/migrations/0007_early_access.sql then 0008_entry_hardening.sql against the project the app points at.',
  },
  EVENTS_TABLE_MISSING: {
    severity: 'note',
    title: 'The entry log table is missing from this database.',
    fix: 'Supabase, SQL editor: run supabase/migrations/0008_entry_hardening.sql. Signup works without it; the trail is just silent.',
  },
  ACTIVATION_FUNCTION_MISSING: {
    severity: 'note',
    title: 'The free-year activation function is missing from this database.',
    fix: 'Supabase, SQL editor: run supabase/migrations/0008_entry_hardening.sql. Until then activation falls back to the service key.',
  },
  SERVICE_SCHEMA_UNREADABLE: {
    severity: 'note',
    title: 'The database schema could not be inspected.',
    fix: 'Usually a hiccup. Reload this page; if it repeats, check the service key.',
  },
  LIST_EMPTY_UNVERIFIED: {
    severity: 'note',
    title: 'The early-access list read came back empty and could not be verified.',
    fix: 'Reload /api/health. If it repeats, confirm SUPABASE_SERVICE_ROLE_KEY really is the service_role key of this project.',
  },
  SENSITIVE_TABLE_PUBLIC: {
    severity: 'blocker',
    title: 'A private table answers the public key.',
    fix: 'Row level security or the table grants are open. Run the migrations named in the report and rotate anything that was exposed.',
  },
};

/** Sensitive tables the PUBLIC key must never be able to read. */
const SENSITIVE_TABLES = [
  'early_access_emails',
  'entry_events',
  'audit_log',
  'webhook_events',
] as const;

/** Tables that exist from migration 0001 and are invisible to a public key,
 * so seeing them proves the key really is a service key. */
const PRIVILEGE_WITNESS_TABLES = ['/audit_log', '/webhook_events', '/early_access_emails'];

const PROBE_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 3_000_000;

export interface Probe {
  status: number;
  ok: boolean;
  note: string | null;
}

export interface KeySummary {
  present: boolean;
  format: KeyFormat;
  ref: string | null;
  role: string | null;
  matchesUrl: boolean | null;
}

export interface EntryEventView {
  at: string;
  kind: string;
  code: string | null;
  email: string | null;
}

export interface HealthReport {
  ok: boolean;
  primary: HealthCode;
  codes: HealthCode[];
  checkedAt: string;
  env: EnvPresence;
  url: { host: string | null; ref: string | null; problem: string | null };
  anon: KeySummary;
  service: KeySummary;
  probes: {
    auth: Probe;
    serviceSchema: Probe;
    anonSchema: Probe;
    list: Probe;
    events: Probe;
    publicLeak: { table: string; status: number } | null;
  };
  listRows: number | null;
  operatorListed: boolean | null;
  recentEvents: EntryEventView[];
  action: CodeMeaning | null;
}

interface RawProbe {
  status: number;
  ok: boolean;
  body: string;
  error: string | null;
}

async function rawProbe(url: string, init: RequestInit): Promise<RawProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
    const body = (await response.text().catch(() => '')).slice(0, MAX_BODY_BYTES);
    return { status: response.status, ok: response.ok, body, error: null };
  } catch (error) {
    return {
      status: 0,
      ok: false,
      body: '',
      error: (error instanceof Error ? error.message : String(error)).slice(0, 200),
    };
  } finally {
    clearTimeout(timer);
  }
}

function toProbe(raw: RawProbe): Probe {
  const note = raw.error ?? (raw.ok ? null : raw.body.slice(0, 200));
  return { status: raw.status, ok: raw.ok, note: note === '' ? null : note };
}

function restHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

/** Operator address the report may name in full (it is already public). */
export const OPERATOR_EMAIL = 'navaira.builds@gmail.com';

export interface RunHealthOptions {
  /** Bypass the short cache. */
  fresh?: boolean;
  /** Read the recent entry events too (skipped for the signup path). */
  withEvents?: boolean;
}

let cache: { at: number; report: HealthReport } | null = null;
const CACHE_MS = 10_000;

/** Drop the cached report and privilege verdict. Tests, and after a change. */
export function resetHealthCache(): void {
  cache = null;
  privilegeCache = null;
}

export async function runHealth(options: RunHealthOptions = {}): Promise<HealthReport> {
  const now = Date.now();
  if (options.fresh !== true && cache !== null && now - cache.at < CACHE_MS) {
    return cache.report;
  }

  const env = envPresence();
  const codes: HealthCode[] = [];

  let url = '';
  let anonKey: string | null = null;
  try {
    const publicEnv = readPublicEnv();
    url = publicEnv.url;
    anonKey = publicEnv.anonKey;
  } catch {
    // Named by the presence flags below.
  }
  const serviceKeyValue = readServiceKey();

  const urlFacts = readUrlFacts(url);
  const anonFacts = readKeyFacts(anonKey ?? '');
  const serviceFacts = readKeyFacts(serviceKeyValue ?? '');

  if (!env.url) codes.push('ENV_URL_MISSING');
  if (!env.anonKey) codes.push('ENV_ANON_MISSING');
  if (!env.serviceKey) codes.push('ENV_SERVICE_MISSING');
  if (env.url && !urlFacts.ok) codes.push('URL_MALFORMED');

  // Key shape checks need no network call: they are the fastest answer to
  // "the key is real, the request fails".
  if (env.anonKey) {
    if (anonFacts.role === 'service_role' || anonFacts.format === 'sb_secret') {
      codes.push('ANON_NOT_ANON');
    }
    if (urlFacts.ref !== null && anonFacts.ref !== null && anonFacts.ref !== urlFacts.ref) {
      codes.push('ANON_URL_MISMATCH');
    }
  }
  if (env.serviceKey) {
    if (serviceFacts.format === 'unknown') codes.push('SERVICE_KEY_UNREADABLE');
    if (serviceFacts.role === 'anon' || serviceFacts.format === 'sb_publishable') {
      codes.push('SERVICE_NOT_SERVICE');
    }
    if (urlFacts.ref !== null && serviceFacts.ref !== null && serviceFacts.ref !== urlFacts.ref) {
      codes.push('SERVICE_URL_MISMATCH');
    }
  }

  const notAttempted: Probe = { status: 0, ok: false, note: 'not attempted' };
  const probes: HealthReport['probes'] = {
    auth: notAttempted,
    serviceSchema: notAttempted,
    anonSchema: notAttempted,
    list: notAttempted,
    events: notAttempted,
    publicLeak: null,
  };
  let listRows: number | null = null;
  let operatorListed: boolean | null = null;
  let recentEvents: EntryEventView[] = [];
  let schemaPaths: string[] = [];
  let privileged = env.serviceKey;

  if (urlFacts.ok && env.anonKey) {
    const authRaw = await rawProbe(`${url}/auth/v1/health`, { headers: { apikey: anonKey ?? '' } });
    probes.auth = toProbe(authRaw);
    if (authRaw.status === 0 || authRaw.status >= 500) codes.push('DB_UNREACHABLE');
    else if (authRaw.status === 401 || authRaw.status === 403) codes.push('ANON_KEY_REJECTED');

    const anonSchemaRaw = await rawProbe(`${url}/rest/v1/`, { headers: restHeaders(anonKey ?? '') });
    probes.anonSchema = toProbe(anonSchemaRaw);
  }

  if (urlFacts.ok && env.serviceKey) {
    const schemaRaw = await rawProbe(`${url}/rest/v1/`, {
      headers: restHeaders(serviceKeyValue ?? ''),
    });
    probes.serviceSchema = toProbe(schemaRaw);

    if (schemaRaw.status === 0) {
      if (!codes.includes('DB_UNREACHABLE')) codes.push('DB_UNREACHABLE');
    } else if (schemaRaw.status === 401 || schemaRaw.status === 403) {
      codes.push('SERVICE_KEY_REJECTED');
    } else if (schemaRaw.status >= 500) {
      if (!codes.includes('DB_UNREACHABLE')) codes.push('DB_UNREACHABLE');
    } else if (schemaRaw.ok) {
      schemaPaths = pathsOf(schemaRaw.body);
      privileged = PRIVILEGE_WITNESS_TABLES.some((path) => schemaPaths.includes(path));
      if (!privileged && !codes.includes('SERVICE_NOT_SERVICE')) codes.push('SERVICE_NOT_SERVICE');
      if (!schemaPaths.includes('/early_access_emails')) codes.push('LIST_TABLE_MISSING');
      if (!schemaPaths.includes('/entry_events')) codes.push('EVENTS_TABLE_MISSING');
      if (!schemaPaths.includes('/rpc/activate_free_year')) codes.push('ACTIVATION_FUNCTION_MISSING');
    } else {
      codes.push('SERVICE_SCHEMA_UNREADABLE');
    }

    if (privileged) {
      const listRaw = await rawProbe(
        `${url}/rest/v1/early_access_emails?select=id,status,email&order=created_at.desc&limit=200`,
        { headers: restHeaders(serviceKeyValue ?? '') },
      );
      probes.list = toProbe(listRaw);
      if (listRaw.ok) {
        listRows = parseRows(listRaw.body)?.length ?? null;
        if (listRows === 0 && !codes.includes('LIST_EMPTY_UNVERIFIED')) {
          // The key proved itself, so an empty list is a real answer: the
          // founder's own row would show here if it had been imported.
          codes.push('LIST_EMPTY_UNVERIFIED');
        }
      } else if (listRaw.status === 404) {
        if (!codes.includes('LIST_TABLE_MISSING')) codes.push('LIST_TABLE_MISSING');
      } else if (listRaw.status === 401 || listRaw.status === 403) {
        if (!codes.includes('SERVICE_KEY_REJECTED')) codes.push('SERVICE_KEY_REJECTED');
      }

      if (options.withEvents !== false) {
        const eventsRaw = await rawProbe(
          `${url}/rest/v1/entry_events?select=at,kind,code,email&order=at.desc&limit=5`,
          { headers: restHeaders(serviceKeyValue ?? '') },
        );
        probes.events = toProbe(eventsRaw);
        if (eventsRaw.ok) recentEvents = parseEvents(eventsRaw.body);
      }

      operatorListed = await operatorOnList(url, serviceKeyValue ?? '');
    }
  }

  // Public-key leak check: private tables must refuse an anonymous caller.
  if (urlFacts.ok && env.anonKey) {
    for (const table of SENSITIVE_TABLES) {
      const attempt = await rawProbe(`${url}/rest/v1/${table}?select=*&limit=1`, {
        headers: restHeaders(anonKey ?? ''),
      });
      if (attempt.ok) {
        probes.publicLeak = { table, status: attempt.status };
        if (!codes.includes('SENSITIVE_TABLE_PUBLIC')) codes.push('SENSITIVE_TABLE_PUBLIC');
        break;
      }
    }
  }

  const order: Severity[] = ['blocker', 'warning', 'note'];
  const ordered = order.flatMap((severity) =>
    codes.filter((code) => HEALTH_CODES[code].severity === severity),
  );
  const primary: HealthCode = ordered[0] ?? 'OK';

  const report: HealthReport = {
    ok: codes.every((code) => HEALTH_CODES[code].severity !== 'blocker') && probes.auth.ok,
    primary,
    codes: ordered,
    checkedAt: new Date().toISOString(),
    env,
    url: { host: urlFacts.host, ref: urlFacts.ref, problem: urlFacts.problem },
    anon: summarizeKey(anonFacts, urlFacts.ref),
    service: summarizeKey(serviceFacts, urlFacts.ref),
    probes,
    listRows,
    operatorListed,
    recentEvents,
    action: primary === 'OK' ? null : HEALTH_CODES[primary],
  };

  cache = { at: now, report };
  return report;
}

function summarizeKey(facts: ReturnType<typeof readKeyFacts>, urlRef: string | null): KeySummary {
  return {
    present: facts.format !== 'absent',
    format: facts.format,
    ref: facts.ref,
    role: facts.role,
    matchesUrl: facts.ref === null || urlRef === null ? null : facts.ref === urlRef,
  };
}

function pathsOf(body: string): string[] {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'paths' in parsed) {
      const paths = (parsed as { paths?: unknown }).paths;
      if (typeof paths === 'object' && paths !== null) return Object.keys(paths);
    }
  } catch {
    // Not JSON (a proxy error page, say): the caller names it as unreadable.
  }
  return [];
}

function parseRows(body: string | null): unknown[] | null {
  if (body === null) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function parseEvents(body: string | null): EntryEventView[] {
  const rows = parseRows(body);
  if (rows === null) return [];
  const events: EntryEventView[] = [];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const rawEmail = typeof record.email === 'string' ? record.email : null;
    events.push({
      at: typeof record.at === 'string' ? record.at : '',
      kind: typeof record.kind === 'string' ? record.kind : 'unknown',
      code: typeof record.code === 'string' ? record.code : null,
      email: rawEmail === null || rawEmail === OPERATOR_EMAIL ? rawEmail : maskEmail(rawEmail),
    });
  }
  return events;
}

async function operatorOnList(url: string, key: string): Promise<boolean | null> {
  const normalized = encodeURIComponent(OPERATOR_EMAIL);
  const attempt = await rawProbe(
    `${url}/rest/v1/early_access_emails?select=email&email_norm=eq.${normalized}&limit=1`,
    { headers: restHeaders(key) },
  );
  if (attempt.ok) {
    const rows = parseRows(attempt.body);
    if (rows !== null) return rows.length > 0;
  }
  // 0008 not applied yet (no email_norm column): compare in the app instead.
  const fallback = await rawProbe(
    `${url}/rest/v1/early_access_emails?select=email&limit=1000`,
    { headers: restHeaders(key) },
  );
  if (!fallback.ok) return null;
  const rows = parseRows(fallback.body);
  if (rows === null) return null;
  return rows.some((row) => {
    if (typeof row !== 'object' || row === null) return false;
    const email = (row as { email?: unknown }).email;
    return typeof email === 'string' && email.trim().toLowerCase() === OPERATOR_EMAIL;
  });
}

/**
 * Is the key in the service slot really allowed to read the private tables?
 *
 * This is the answer to the silent empty read: an unprivileged key gets an
 * EMPTY result from `early_access_emails`, not an error, so an unverified empty
 * read used to send a listed founder to the wrong door. One request (the REST
 * schema document, which lists a table only for a role that may read it) decides
 * it. Cached briefly because the signup door calls it.
 */
export type PrivilegeVerdict = 'privileged' | 'not-privileged' | 'unknown';

let privilegeCache: { at: number; verdict: PrivilegeVerdict } | null = null;
const PRIVILEGE_CACHE_MS = 30_000;

export async function verifyServicePrivilege(): Promise<PrivilegeVerdict> {
  const now = Date.now();
  if (privilegeCache !== null && now - privilegeCache.at < PRIVILEGE_CACHE_MS) {
    return privilegeCache.verdict;
  }
  let verdict: PrivilegeVerdict = 'unknown';
  try {
    const { url } = readPublicEnv();
    const key = readServiceKey();
    const facts = readUrlFacts(url);
    if (facts.ok && key !== null) {
      const raw = await rawProbe(`${url}/rest/v1/`, { headers: restHeaders(key) });
      if (raw.ok) {
        const paths = pathsOf(raw.body);
        if (paths.length > 0) {
          verdict = PRIVILEGE_WITNESS_TABLES.some((path) => paths.includes(path))
            ? 'privileged'
            : 'not-privileged';
        }
      }
    }
  } catch {
    verdict = 'unknown';
  }
  privilegeCache = { at: now, verdict };
  return verdict;
}

/** Forget the cached privilege verdict (tests, and after a variable change). */
export function resetPrivilegeCache(): void {
  privilegeCache = null;
}

/** Codes that matter to the signup door, most severe first. */
export function entryBlockers(report: HealthReport): HealthCode[] {
  const relevant: HealthCode[] = [
    'SENSITIVE_TABLE_PUBLIC',
    'ENV_URL_MISSING',
    'ENV_ANON_MISSING',
    'URL_MALFORMED',
    'ANON_NOT_ANON',
    'ANON_URL_MISMATCH',
    'DB_UNREACHABLE',
    'ANON_KEY_REJECTED',
    'ENV_SERVICE_MISSING',
    'SERVICE_NOT_SERVICE',
    'SERVICE_URL_MISMATCH',
    'SERVICE_KEY_UNREADABLE',
    'SERVICE_KEY_REJECTED',
    'LIST_TABLE_MISSING',
    'SERVICE_SCHEMA_UNREADABLE',
    'LIST_EMPTY_UNVERIFIED',
    'EVENTS_TABLE_MISSING',
    'ACTIVATION_FUNCTION_MISSING',
  ];
  const found = report.codes.filter((code) => relevant.includes(code));
  return found.length > 0 ? found : report.primary === 'OK' ? [] : [report.primary];
}

/** Codes that still leave a usable signup: the inbox code can still be sent. */
const CONTINUE_ALLOWED: HealthCode[] = [
  'ENV_SERVICE_MISSING',
  'SERVICE_NOT_SERVICE',
  'SERVICE_KEY_UNREADABLE',
  'SERVICE_URL_MISMATCH',
  'SERVICE_KEY_REJECTED',
  'LIST_TABLE_MISSING',
  'SERVICE_SCHEMA_UNREADABLE',
  'LIST_EMPTY_UNVERIFIED',
  'EVENTS_TABLE_MISSING',
  'ACTIVATION_FUNCTION_MISSING',
];

export function canContinueWithoutList(code: HealthCode): boolean {
  return CONTINUE_ALLOWED.includes(code);
}
