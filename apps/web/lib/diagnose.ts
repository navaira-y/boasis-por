import 'server-only';
import { envPresence, readPublicEnv, readServiceKey, type EnvPresence } from './env';
import { readKeyFacts, readUrlFacts, type KeyFormat } from './keys';
import { classifyDbFailure } from './db-error';

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
  | 'SERVICE_GRANTS_MISSING'
  | 'ANON_GRANTS_MISSING'
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
    title: 'Supabase rejected the service key (401).',
    fix: 'The key was rotated or revoked, or it belongs to another project. Copy the current service_role key from Supabase, Settings, API keys into Railway, then redeploy.',
  },
  SERVICE_GRANTS_MISSING: {
    severity: 'blocker',
    title: 'The service key is real, but the database has not granted it access to the app tables.',
    fix: 'This is a grant, not a key: Supabase answers 42501 permission denied. Supabase, SQL editor: run supabase/migrations/0009_service_role_grants.sql on this project, then reload this page. No key needs changing.',
  },
  ANON_GRANTS_MISSING: {
    severity: 'blocker',
    title: 'The public key cannot read public.plans, which every page needs.',
    fix: 'Supabase, SQL editor: run supabase/migrations/0001_phase1_core.sql (it grants the public key what the pages read) and then 0009. This is a grant, not a key.',
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
    title: 'The database answered something this app does not recognise.',
    fix: 'Usually a hiccup. Reload /api/health; if it repeats, read the probe notes below and send them on.',
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

/** Adds a code once, wherever a probe reports it. */
function addCode(codes: HealthCode[], code: HealthCode): void {
  if (!codes.includes(code)) codes.push(code);
}

/**
 * The named problem behind one failed probe. `missingCode` is what a 404 means
 * for THIS probe, because a missing table and a missing function are reported
 * differently but look identical on the wire.
 */
function failureCode(raw: RawProbe, missingCode: HealthCode): HealthCode {
  const verdict = classifyDbFailure({
    status: raw.status,
    code: errorCodeOf(raw.body),
    message: raw.body,
  });
  switch (verdict) {
    case 'key-rejected':
      return 'SERVICE_KEY_REJECTED';
    case 'grants-missing':
      return 'SERVICE_GRANTS_MISSING';
    case 'table-missing':
    case 'function-missing':
      return missingCode;
    case 'unreachable':
      return 'DB_UNREACHABLE';
    case 'unknown':
      return 'SERVICE_SCHEMA_UNREADABLE';
  }
}

/** True when the function answered "no session", i.e. it is there and it refused. */
function isNoSessionRefusal(body: string): boolean {
  if (errorCodeOf(body) === 'P0002') return true;
  return /no session/i.test(body);
}

/** The PostgREST/Postgres error code inside a response body, if it carries one. */
function errorCodeOf(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'code' in parsed) {
      const code = (parsed as { code?: unknown }).code;
      if (typeof code === 'string') return code;
    }
  } catch {
    // A non-JSON body (an HTML proxy page, say): the classifier reads the text.
  }
  return null;
}

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
    /** early_access_emails read with the service key: the signup door's read. */
    list: Probe;
    /** entry_events read with the service key: the entry trail. */
    events: Probe;
    /** activate_free_year, called with the service key and no session. */
    activation: Probe;
    /** plans read with the PUBLIC key: what every visitor's page needs. */
    plansAnon: Probe;
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
    list: notAttempted,
    events: notAttempted,
    activation: notAttempted,
    plansAnon: notAttempted,
    publicLeak: null,
  };
  let listRows: number | null = null;
  let operatorListed: boolean | null = null;
  let recentEvents: EntryEventView[] = [];

  if (urlFacts.ok && env.anonKey) {
    const authRaw = await rawProbe(`${url}/auth/v1/health`, { headers: { apikey: anonKey ?? '' } });
    probes.auth = toProbe(authRaw);
    if (authRaw.status === 0 || authRaw.status >= 500) addCode(codes, 'DB_UNREACHABLE');
    else if (authRaw.status === 401 || authRaw.status === 403) addCode(codes, 'ANON_KEY_REJECTED');

    // What every visitor's page reads with the public key. If this is denied,
    // the plan cards and the gate cannot work for anybody.
    const plansRaw = await rawProbe(`${url}/rest/v1/plans?select=id&limit=1`, {
      headers: restHeaders(anonKey ?? ''),
    });
    probes.plansAnon = toProbe(plansRaw);
    if (!plansRaw.ok && (plansRaw.status === 401 || plansRaw.status === 403)) {
      addCode(codes, 'ANON_GRANTS_MISSING');
    }
  }

  if (urlFacts.ok && env.serviceKey) {
    // The signup door's own read, so the report describes the real thing.
    const listRaw = await rawProbe(
      `${url}/rest/v1/early_access_emails?select=id,status,email&order=created_at.desc&limit=200`,
      { headers: restHeaders(serviceKeyValue ?? '') },
    );
    probes.list = toProbe(listRaw);
    if (listRaw.ok) {
      listRows = parseRows(listRaw.body)?.length ?? null;
      if (listRows === 0) addCode(codes, 'LIST_EMPTY_UNVERIFIED');
    } else {
      addCode(codes, failureCode(listRaw, 'LIST_TABLE_MISSING'));
    }

    if (options.withEvents !== false) {
      const eventsRaw = await rawProbe(
        `${url}/rest/v1/entry_events?select=at,kind,code,email&order=at.desc&limit=5`,
        { headers: restHeaders(serviceKeyValue ?? '') },
      );
      probes.events = toProbe(eventsRaw);
      if (eventsRaw.ok) {
        recentEvents = parseEvents(eventsRaw.body);
      } else {
        addCode(codes, failureCode(eventsRaw, 'EVENTS_TABLE_MISSING'));
      }
    }

    // Called with the service key and no session, the function itself raises
    // "no session": any answer except a 404 proves the function is installed.
    const activationRaw = await rawProbe(`${url}/rest/v1/rpc/activate_free_year`, {
      method: 'POST',
      headers: { ...restHeaders(serviceKeyValue ?? ''), 'content-type': 'application/json' },
      body: '{}',
    });
    probes.activation = toProbe(activationRaw);
    if (activationRaw.status === 404) {
      addCode(codes, 'ACTIVATION_FUNCTION_MISSING');
    } else if (activationRaw.status === 401 || activationRaw.status === 403) {
      addCode(codes, failureCode(activationRaw, 'ACTIVATION_FUNCTION_MISSING'));
    } else if (isNoSessionRefusal(activationRaw.body)) {
      // This is the answer a healthy project gives: the function is installed,
      // it is security definer, and it refused a caller with no session
      // (P0002). That is the whole point of it, so the probe counts as passed
      // and says why, instead of leaving a red 500 on the operator's screen.
      probes.activation = {
        status: activationRaw.status,
        ok: true,
        note: 'Installed, and it refused an anonymous call with P0002 no session, which is exactly right.',
      };
    }

    // Only worth asking when the list itself answered: otherwise the report has
    // already named the problem and this would only add noise.
    if (listRaw.ok) operatorListed = await operatorOnList(url, serviceKeyValue ?? '');
  }

  // Public-key leak check: private tables must refuse an anonymous caller.
  if (urlFacts.ok && env.anonKey) {
    for (const table of SENSITIVE_TABLES) {
      const attempt = await rawProbe(`${url}/rest/v1/${table}?select=*&limit=1`, {
        headers: restHeaders(anonKey ?? ''),
      });
      if (attempt.ok) {
        probes.publicLeak = { table, status: attempt.status };
        addCode(codes, 'SENSITIVE_TABLE_PUBLIC');
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

/**
 * Is the key in the service slot really allowed to read the private tables?
 *
 * This is the answer to the silent empty read: before grants existed, an
 * unprivileged key got an EMPTY result from a private table rather than an
 * error, so an unverified empty read could send a listed founder to the wrong
 * door. entry_events is the witness because it is private by design (0008
 * revoked it from anon and authenticated), so a 200 proves the caller is both
 * the service key AND granted access to it.
 *
 * The project's REST root (OpenAPI) is deliberately NOT used for this: newer
 * Supabase projects answer it with 403 even to a perfect service key, which is
 * exactly how a healthy project got reported as "key rejected".
 */
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
      const raw = await rawProbe(`${url}/rest/v1/entry_events?select=at&limit=1`, {
        headers: restHeaders(key),
      });
      if (raw.ok) {
        verdict = 'privileged';
      } else {
        const failure = classifyDbFailure({
          status: raw.status,
          code: errorCodeOf(raw.body),
          message: raw.body,
        });
        // A missing table is not a privilege answer either way.
        verdict =
          failure === 'grants-missing' || failure === 'key-rejected'
            ? 'not-privileged'
            : 'unknown';
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
    'SERVICE_GRANTS_MISSING',
    'ANON_GRANTS_MISSING',
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
  // A grant problem does not stop signup: the inbox code still protects the
  // account and the free year is granted inside the database by 0008's
  // function, which does not depend on these grants. The visitor continues on
  // the plans door while the operator runs 0009.
  'SERVICE_GRANTS_MISSING',
  'LIST_TABLE_MISSING',
  'SERVICE_SCHEMA_UNREADABLE',
  'LIST_EMPTY_UNVERIFIED',
  'EVENTS_TABLE_MISSING',
  'ACTIVATION_FUNCTION_MISSING',
];

export function canContinueWithoutList(code: HealthCode): boolean {
  return CONTINUE_ALLOWED.includes(code);
}
