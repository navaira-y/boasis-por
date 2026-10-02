import type { CompanyFacts, Document, Field, IsoDate } from '@boasis/schema';
import type { Repos } from '../../data/types';
import type { PickedFile } from '../../lib/files';
import { EMPTY, type Entry } from '../../lib/onboarding/fields';
import { dateOf, NO_DATE, partsOf, type DateParts } from './controls';

// Small bridges between what the controls hold and the stored fields.

export function dateEntry(parts: DateParts): Entry<IsoDate> {
  const date = dateOf(parts);
  return date.kind === 'date' ? { kind: 'value', value: date.value } : EMPTY;
}

export function partsOfField(field: Field<IsoDate> | null | undefined): DateParts {
  return field?.state === 'known' ? partsOf(field.value) : NO_DATE;
}

// A choice that may be "Not sure": the value, the unknown state, or nothing yet.
export const NOT_SURE = 'not-sure' as const;
export type WithNotSure<T extends string> = T | typeof NOT_SURE | '';

export function choiceEntry<T extends string>(value: WithNotSure<T>): Entry<T> {
  if (value === '') {
    return EMPTY;
  }
  if (value === NOT_SURE) {
    return { kind: 'not-sure' };
  }
  return { kind: 'value', value };
}

export function choiceOfField<T extends string>(
  field: Field<T> | null | undefined,
): WithNotSure<T> {
  if (field === null || field === undefined) {
    return '';
  }
  if (field.state === 'known') {
    return field.value;
  }
  return field.state === 'unknown' ? NOT_SURE : '';
}

// Section B.8: an upload is kept in the vault only, filed against the company or the person.
export async function fileUploads(
  repos: Repos,
  companyId: string,
  uploads: readonly {
    file: PickedFile;
    type: Document['type'];
    title: string;
    personId: string | null;
  }[],
  on: IsoDate,
): Promise<void> {
  for (const upload of uploads) {
    await repos.documents.create({
      companyId,
      personId: upload.personId,
      type: upload.type,
      title: upload.title,
      issueDate: null,
      expiryDate: null,
      fileName: upload.file.name,
      uploadedOn: on,
      version: 1,
    });
  }
}

// The company as the older screens need it after an onboarding write: the plain numbers and
// flags they read, kept in step with the answers.
export type CompanyPatch = Partial<Omit<CompanyFacts, 'id'>>;

// An error object with only the errors that are there, so "any errors?" is a key count.
export function definedOnly<K extends string>(
  entries: Partial<Record<K, string | undefined>>,
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const key of Object.keys(entries) as K[]) {
    const value = entries[key];
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}
