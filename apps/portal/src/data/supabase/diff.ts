import { JsonValue } from '@boasis/schema';
import type { FieldChangeKind } from '../types';

// The field-by-field difference between two versions of a record, for the history (spec 5.1).
// A deliberate copy of the mock's fieldChanges, not an import: a production build must never
// pull in the mock module. Plain objects are walked into; a list or a single value is one
// field, so adding an activity is one change to "identity.activities" with the whole old and
// new list.

export interface FieldChange {
  readonly path: string;
  readonly oldValue: JsonValue;
  readonly newValue: JsonValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Undefined is stored as absent; the history holds it as null.
export function toJson(value: unknown): JsonValue {
  return JsonValue.parse(value === undefined ? null : JSON.parse(JSON.stringify(value)));
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function fieldChanges(before: unknown, after: unknown, prefix = ''): FieldChange[] {
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys
      .filter((key) => prefix !== '' || key !== 'id')
      .flatMap((key) =>
        fieldChanges(before[key], after[key], prefix === '' ? key : `${prefix}.${key}`),
      );
  }
  if (same(before, after)) {
    return [];
  }
  // A group that was not entered (null) and is now filled, or the other way round, is one field.
  return [{ path: prefix, oldValue: toJson(before), newValue: toJson(after) }];
}

// Short field names written as people write them.
const ACRONYMS: Readonly<Record<string, string>> = {
  trn: 'TRN',
  ubo: 'UBO',
  ubos: 'UBOs',
  pro: 'PRO',
  proCard: 'PRO card',
  eSignatureCards: 'e-signature cards',
  mohreCard: 'MOHRE card',
  mohreClassification: 'MOHRE classification',
};

// "identity.licenceCategory" reads "licence category"; "tax.vat.trn" reads "TRN".
export function fieldLabel(path: string): string {
  const last = path.split('.').pop() ?? path;
  const known = ACRONYMS[last];
  if (known !== undefined) {
    return known;
  }
  return last
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();
}

// Up to three field names in a sentence, then how many more.
export function fieldList(changes: readonly FieldChange[]): string {
  const labels = [...new Set(changes.map((change) => fieldLabel(change.path)))];
  if (labels.length <= 3) {
    return labels.length <= 1
      ? (labels[0] ?? '')
      : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1] ?? ''}`;
  }
  return `${labels.slice(0, 3).join(', ')} and ${String(labels.length - 3)} more`;
}

// Spec 7.3 verbs for the audit line updateFields writes.
export const KIND_VERB: Readonly<Record<FieldChangeKind, string>> = {
  correction: 'Corrected',
  amendment: 'Amended',
  'from-document': 'Confirmed from a document',
};

// A plain update: the audit trail notes the fields; the history is written by updateFields.
export function changedLine(changes: readonly FieldChange[], of: string): string {
  return `Changed ${fieldList(changes)} for ${of}`;
}
