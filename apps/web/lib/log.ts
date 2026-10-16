import 'server-only';
import { adminSupabaseOrNull } from './supabase';
import { maskEmail } from './diagnose';

/**
 * Entry trail. Every interesting moment on the way in writes ONE row to
 * public.entry_events (server-only table, RLS on, no grants), so support is a
 * single SQL line for the operator and /api/health can show the last few.
 * Full addresses stay in the private table; Railway logs get a masked address
 * only.
 *
 * Logging never breaks a flow: if the table or the key is missing the caller
 * carries on and the app logs a masked one-liner instead.
 */

const LOG_TIMEOUT_MS = 1_500;

export type EntryEventKind =
  | 'entry_check'
  | 'plan_wish'
  | 'code_sent'
  | 'code_verified'
  | 'code_failed'
  | 'signin'
  | 'account_created'
  | 'activation'
  | 'activation_fallback';

export interface EntryEventInput {
  kind: EntryEventKind;
  email?: string | null;
  /** A HealthCode or a short machine word; never personal data. */
  code?: string | null;
  meta?: Record<string, unknown>;
}

export async function logEntryEvent(input: EntryEventInput): Promise<void> {
  const email = input.email === undefined || input.email === null ? null : input.email.toLowerCase();
  const summary = `entry: kind=${input.kind}${input.code ? ` code=${input.code}` : ''}${
    email ? ` email=${maskEmail(email)}` : ''
  }`;
  if (input.code !== null && input.code !== undefined && input.code !== 'OK') {
    console.error(summary);
  } else {
    console.info(summary);
  }

  const admin = adminSupabaseOrNull();
  if (admin === null) return;
  try {
    // Bounded: the trail is worth one round trip, never a stall. With the
    // database unreachable the client would retry, so the visitor's answer is
    // released after 1.5 s at the latest and the console line above still
    // carries the event.
    await Promise.race([
      admin.from('entry_events').insert({
        kind: input.kind,
        code: input.code ?? null,
        email,
        meta: input.meta ?? {},
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, LOG_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // The table may not exist yet (0008 pending). The console line above is
    // the fallback trail; nothing about this can break the visitor's flow.
  }
}

/** Append to the audit trail. Server only, never fails the caller. */
export async function auditEvent(entry: {
  actorProfileId: string | null;
  action: string;
  entity: string;
  entityId: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const admin = adminSupabaseOrNull();
  if (admin === null) return;
  try {
    await admin.from('audit_log').insert({
      actor_profile_id: entry.actorProfileId,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId,
      meta: entry.meta ?? {},
    });
  } catch (error) {
    console.error(
      `audit skipped: action=${entry.action} reason=${
        error instanceof Error ? error.message : 'unknown'
      }`,
    );
  }
}
