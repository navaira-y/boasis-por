import { z } from 'zod';
import { Id, IsoDate } from './common';

// Who did something: the account owner, a member acting through their access grant, or the
// portal itself (a reminder it sent). grantId is set only for a member.
export const Actor = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('owner'), name: z.string().min(1) }),
  z.object({ kind: z.literal('member'), grantId: Id, name: z.string().min(1) }),
  z.object({ kind: z.literal('system'), name: z.string().min(1) }),
]);
export type Actor = z.infer<typeof Actor>;

// Any value a field can hold, as stored: the old and new value of a history entry.
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValue),
    z.record(z.string(), JsonValue),
  ]),
);

// Spec 5.1: every field keeps a dated history. A correction fixes a value that was wrong and
// recomputes; an amendment is a real change to the company; from-document is a value confirmed
// from an uploaded document; created opens the record.
export const HistoryKind = z.enum(['created', 'correction', 'amendment', 'from-document']);
export type HistoryKind = z.infer<typeof HistoryKind>;

// The record a field belongs to.
export const HistorySubject = z.object({
  kind: z.enum(['company', 'office', 'person']),
  id: Id,
});
export type HistorySubject = z.infer<typeof HistorySubject>;

// One field change. fieldPath is the dotted path inside the record, for example
// "identity.licenceCategory" or "ownership.shareholders"; lists are one field. A created entry
// names the whole record with the path "record" and holds null on both sides.
export const HistoryEntry = z.object({
  id: Id,
  companyId: Id,
  subject: HistorySubject,
  fieldPath: z.string().min(1),
  oldValue: JsonValue,
  newValue: JsonValue,
  kind: HistoryKind,
  on: IsoDate,
  who: Actor,
  documentId: Id.nullable().optional(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;
