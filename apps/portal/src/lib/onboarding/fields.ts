import type { Field, IsoDate } from '@boasis/schema';

// Onboarding v2 section B.5: every value the person enters is stored with its state, its origin
// and the day it was entered. These build the three states from what a screen holds.

export function knownField<T>(value: T, on: IsoDate): Field<T> {
  return { state: 'known', value, origin: 'user', enteredOn: on };
}

export function unknownField<T>(on: IsoDate): Field<T> {
  return { state: 'unknown', value: null, origin: 'user', enteredOn: on };
}

export function skippedField<T>(on: IsoDate): Field<T> {
  return { state: 'skipped', value: null, origin: 'user', enteredOn: on };
}

// What a control on screen holds for one answer: a value, "Not sure", "I'll add this later", or
// nothing yet.
export type Entry<T> =
  { kind: 'value'; value: T } | { kind: 'not-sure' } | { kind: 'later' } | { kind: 'empty' };

export const EMPTY = { kind: 'empty' } as const;

export function entryOf<T>(field: Field<T> | null | undefined): Entry<T> {
  if (field === null || field === undefined) {
    return EMPTY;
  }
  switch (field.state) {
    case 'known':
      return { kind: 'value', value: field.value };
    case 'unknown':
      return { kind: 'not-sure' };
    case 'skipped':
      return { kind: 'later' };
  }
}

// An entry as a stored field. An empty entry is stored as skipped: a question left blank is one
// the person chose to add later (section B.2), so nothing blocks.
export function fieldOf<T>(entry: Entry<T>, on: IsoDate): Field<T> {
  switch (entry.kind) {
    case 'value':
      return knownField(entry.value, on);
    case 'not-sure':
      return unknownField(on);
    case 'later':
    case 'empty':
      return skippedField(on);
  }
}

// The same, keeping the day of an answer that did not change, so re-saving a step does not
// restamp every value.
export function fieldKeeping<T>(
  entry: Entry<T>,
  previous: Field<T> | null | undefined,
  on: IsoDate,
): Field<T> {
  const next = fieldOf(entry, on);
  if (
    previous?.state === next.state &&
    JSON.stringify(previous.value) === JSON.stringify(next.value)
  ) {
    return previous;
  }
  return next;
}

export function valueOf<T>(entry: Entry<T>): T | null {
  return entry.kind === 'value' ? entry.value : null;
}
