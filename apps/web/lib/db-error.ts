/**
 * What a database answer means, in one place.
 *
 * Written after a real production report: Supabase answered
 * `42501 permission denied for table early_access_emails` and the app told the
 * operator "your service key was rotated or revoked", which sent them looking
 * in the wrong place for an hour. A rejected key and a missing GRANT are two
 * different faults with two different fixes, and the response says which one it
 * is if you read it properly:
 *
 *   401 + "Invalid API key"                -> the key is wrong or revoked
 *   403/42501 "permission denied ... TO service_role" -> the key is fine, the
 *                                            GRANT is missing (Supabase's own
 *                                            hint names the GRANT to run)
 *   404 PGRST205 / 42P01                   -> the table is not there
 *   404 PGRST202                           -> the function is not there
 *   timeouts, 5xx, fetch failed            -> nothing is answering
 *
 * Pure module: no server-only imports, so both the health probe and the signup
 * door classify a failure the same way.
 */

export type DbFailure =
  | 'key-rejected'
  | 'grants-missing'
  | 'table-missing'
  | 'function-missing'
  | 'unreachable'
  | 'unknown';

export interface DbFailureInput {
  /** HTTP status, when the caller has one. */
  status?: number;
  /** PostgREST or Postgres error code, when the response carried one. */
  code?: string | null;
  /** The error message, which is the last resort and still tells the truth. */
  message?: string | null;
}

const KEY_WORDS = /invalid api key|no api key found|invalid claim|invalid signature|jwt expired/i;
const GRANT_WORDS = /permission denied|grant the required privileges|not allowed to (select|insert|update|delete)/i;
const TABLE_WORDS = /could not find the table|does not exist|undefined table|schema cache/i;
const FUNCTION_WORDS = /could not find the function/i;
const NETWORK_WORDS =
  /fetch failed|econnrefused|enotfound|econnreset|socket hang up|network|timed out|timeout|did not answer|unreachable|aborted/i;

/**
 * PostgREST hands back a 5xx body without the HTTP status attached, so the
 * server's own words are the status. "Service Unavailable" is a 503 (the
 * database is not answering); a gateway timeout is a 504 from the same layer.
 */
const SERVER_ERROR_WORDS =
  /service unavailable|internal server error|bad gateway|gateway time-?out|temporarily unavailable|upstream/i;

export function classifyDbFailure(input: DbFailureInput): DbFailure {
  // A status of 0 is the probes' convention for "no response at all", so it
  // only means "unreachable" when a status was actually reported.
  const reported = input.status !== undefined;
  const status = input.status ?? 0;
  const code = input.code ?? '';
  const message = input.message ?? '';
  const text = `${code} ${message}`;

  // The key itself, first: it is the only fault the operator fixes with a copy.
  if (status === 401) return 'key-rejected';
  if (KEY_WORDS.test(text)) return 'key-rejected';

  // The key is real and Postgres refused the row-level request. Supabase's
  // hint for this literally spells out the GRANT to run.
  if (code === '42501' || GRANT_WORDS.test(text)) return 'grants-missing';
  if (status === 403) return 'grants-missing';

  if (code === 'PGRST202' || FUNCTION_WORDS.test(text)) return 'function-missing';
  if (code === 'PGRST205' || code === '42P01' || TABLE_WORDS.test(text)) return 'table-missing';
  if (status === 404) return 'table-missing';

  if (reported && (status === 0 || status >= 500)) return 'unreachable';
  if (NETWORK_WORDS.test(text) || SERVER_ERROR_WORDS.test(text)) return 'unreachable';

  return 'unknown';
}
