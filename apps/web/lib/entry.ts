import 'server-only';
import { isValidEmail, normalizeEmail } from './email';
import { readServiceKey } from './env';
import { readKeyFacts } from './keys';
import { adminSupabaseOrNull } from './supabase';
import { HEALTH_CODES, canContinueWithoutList, verifyServicePrivilege, type HealthCode } from './diagnose';
import { logEntryEvent } from './log';
import { asRecord, asRows } from './shape';
import { classifyDbFailure } from './db-error';

/**
 * The door decision for one email address.
 *
 * Three outcomes, and they are never confused:
 *   listed      the address is on the early-access list -> waitlist door
 *   not listed  the list was readable and the address is absent -> plans door
 *   unknown     the list could not be read (or the read could not be trusted)
 *               -> plans door PLUS a NAMED setup problem, because guessing
 *               "you are on the list" would be inventing an answer and a
 *               generic failure helps nobody
 *
 * The list is private: only the service key reads it. The lookup is case-proof
 * (it asks the normalised column, and falls back to comparing the small list
 * itself when that column does not exist yet) because a silently empty read
 * here once sent a listed founder to the wrong door.
 *
 * Cost matters: a broken database must NOT make the visitor wait through a
 * dozen retried probes. The check reads once, classifies the failure from the
 * error it got, and only proves the key's privileges when the read came back
 * empty. The deep probe suite lives in /api/health, where waiting is fine.
 */

export type EntryBranch = 'waitlist' | 'plans';

export interface EntryProblem {
  code: HealthCode;
  title: string;
  fix: string;
  /** The inbox code still protects the account, so the visitor may continue. */
  continueAllowed: boolean;
}

export interface EntryDecision {
  branch: EntryBranch;
  /** true = found, false = searched and absent, null = could not search. */
  listed: boolean | null;
  problem: EntryProblem | null;
  /** Only for an invalid address. */
  error?: string;
}

const MAX_LIST_SCAN = 1000;

interface DbErrorShape {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}

export async function checkEntry(emailRaw: string): Promise<EntryDecision> {
  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    return {
      branch: 'plans',
      listed: null,
      problem: null,
      error: 'Please enter a valid email address.',
    };
  }

  const serviceKey = readServiceKey();
  if (serviceKey === null) {
    // No key at all: the list cannot be read, but signup, the inbox code and
    // the free year all still work, so the visitor continues.
    return problem('ENV_SERVICE_MISSING', email);
  }

  // Zero-cost shape check first: a key that is visibly not a service key can
  // only return an empty list, and an empty list would be a lie.
  const facts = readKeyFacts(serviceKey);
  if (facts.role === 'anon' || facts.format === 'sb_publishable') {
    return problem('SERVICE_NOT_SERVICE', email, { shape: facts.format });
  }

  const admin = adminSupabaseOrNull();
  if (admin === null) return problem('ENV_SERVICE_MISSING', email);

  let error: DbErrorShape | null = null;
  let found = false;
  let searched = false;

  try {
    const normalised = await admin
      .from('early_access_emails')
      .select('id,status')
      .eq('email_norm', email)
      .limit(1);

    if (normalised.error === null) {
      searched = true;
      found = asRows(normalised.data).length > 0;
    } else if (isUnknownColumn(normalised.error)) {
      // 0008 is not applied yet: read the small list and compare in the app.
      const scan = await admin.from('early_access_emails').select('id,email').limit(MAX_LIST_SCAN);
      if (scan.error === null) {
        searched = true;
        found = asRows(scan.data).some((row) => {
          const value = asRecord(row).email;
          return typeof value === 'string' && value.trim().toLowerCase() === email;
        });
      } else {
        error = scan.error;
      }
    } else {
      error = normalised.error;
    }
  } catch (thrown) {
    // A fetch-level failure: DNS, refused connection, TLS. Never a generic
    // sentence on screen.
    await logEntryEvent({
      kind: 'entry_check',
      email,
      code: 'DB_UNREACHABLE',
      meta: { thrown: thrown instanceof Error ? thrown.name : 'unknown' },
    });
    return problem('DB_UNREACHABLE', email);
  }

  if (error !== null) {
    const code = classify(error);
    return problem(code, email, summaryOf(error));
  }

  if (!searched) return problem('SERVICE_SCHEMA_UNREADABLE', email);

  if (found) return finish(email, true, null);

  // Empty answer. Believe it only when the key proved it may read the private
  // tables; otherwise the row may well be sitting there unread.
  const verdict = await verifyServicePrivilege();
  if (verdict === 'not-privileged') {
    // The key could read the list but cannot read a private table: on a real
    // project that is a missing GRANT (42501), not a wrong key.
    return problem('SERVICE_GRANTS_MISSING', email, { witness: 'entry_events' });
  }
  if (verdict === 'unknown') {
    return problem('LIST_EMPTY_UNVERIFIED', email);
  }
  return finish(email, false, null);
}

async function finish(
  email: string,
  listed: boolean,
  problemValue: EntryProblem | null,
): Promise<EntryDecision> {
  await logEntryEvent({ kind: 'entry_check', email, code: 'OK', meta: { listed } });
  return { branch: listed ? 'waitlist' : 'plans', listed, problem: problemValue };
}

async function problem(
  code: HealthCode,
  email: string,
  meta?: Record<string, unknown>,
): Promise<EntryDecision> {
  const meaning = HEALTH_CODES[code];
  await logEntryEvent({ kind: 'entry_check', email, code, meta: meta ?? {} });
  return {
    branch: 'plans',
    listed: null,
    problem: {
      code,
      title: meaning.title,
      fix: meaning.fix,
      continueAllowed: canContinueWithoutList(code),
    },
  };
}

/**
 * Which named problem an error from the list read is.
 *
 * The distinction that matters, learned from a real production report: a
 * revoked key answers 401 and a missing GRANT answers 42501 "permission denied
 * ... TO service_role". Telling the operator "your key was revoked" for the
 * second one sent them hunting for a key that was never wrong. classifyDbFailure
 * reads the response properly; this maps its verdict to the code on screen.
 */
function classify(error: DbErrorShape): HealthCode {
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';
  switch (classifyDbFailure({ code, message })) {
    case 'key-rejected':
      return 'SERVICE_KEY_REJECTED';
    case 'grants-missing':
      return 'SERVICE_GRANTS_MISSING';
    case 'table-missing':
    case 'function-missing':
      return 'LIST_TABLE_MISSING';
    case 'unreachable':
      return 'DB_UNREACHABLE';
    case 'unknown':
      return 'SERVICE_SCHEMA_UNREADABLE';
  }
}

function isUnknownColumn(error: DbErrorShape): boolean {
  const code = typeof error.code === 'string' ? error.code : '';
  return code === '42703' || code === 'PGRST204';
}

/**
 * What goes into the private trail about a database error: the code and a
 * short, clipped message. Keys are never part of a PostgREST error, and any
 * address-looking text is dropped here anyway.
 */
function summaryOf(error: DbErrorShape): Record<string, unknown> {
  const code = typeof error.code === 'string' ? error.code : 'none';
  const message = typeof error.message === 'string' ? error.message.slice(0, 120) : '';
  return { db: code, said: message.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>') };
}
