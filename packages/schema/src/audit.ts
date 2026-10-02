import { z } from 'zod';
import { Id } from './common';
import { Actor } from './history';
import { Channel } from './reminder';

// Spec 7.3: every tick, reference, reminder sent, access change and field change is written to
// the audit trail with who and when, and so is every document added, replaced or deleted.
export const AuditKind = z.enum([
  'step-ticked',
  'reference-logged',
  'reminder-sent',
  'access-changed',
  'field-changed',
  'document-added',
  'document-replaced',
  'document-deleted',
]);
export type AuditKind = z.infer<typeof AuditKind>;

// A moment with its offset, for example 2026-09-14T09:30:00+04:00, so a day's events keep their
// order. Every product date is Asia/Dubai (spec 7.1).
export const Timestamp = z.string().datetime({ offset: true });
export type Timestamp = z.infer<typeof Timestamp>;

export const AuditEvent = z.object({
  id: Id,
  companyId: Id,
  when: Timestamp,
  who: Actor,
  kind: AuditKind,
  // One plain line, for example "Reminder sent to Sara Al Ali by email".
  summary: z.string().min(1),
  cardId: Id.nullable().optional(),
  documentId: Id.nullable().optional(),
  personId: Id.nullable().optional(),
  // For a reminder sent: the channel it went by (spec 7.3, to whom and by which channel).
  channel: Channel.nullable().optional(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;
