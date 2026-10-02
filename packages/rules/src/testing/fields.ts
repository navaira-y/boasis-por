import type { Field } from '@boasis/schema';

// Onboarding answers for the tests.
export const ENTERED_ON = '2026-09-28';

export function known<T>(value: T): Field<T> {
  return { state: 'known', value, origin: 'user', enteredOn: ENTERED_ON };
}

export function notSure<T>(): Field<T> {
  return { state: 'unknown', value: null, origin: 'user', enteredOn: ENTERED_ON };
}

export function skipped<T>(): Field<T> {
  return { state: 'skipped', value: null, origin: 'user', enteredOn: ENTERED_ON };
}
