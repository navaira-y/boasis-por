import type { Fact, Field } from '@boasis/schema';

// The value of a user-entered field when it is known; null when it was not asked, the person was
// not sure, or they skipped it. Every rule reads onboarding answers through this, so "not sure"
// and "later" both come out as unknown.
export function knownValue<T>(entry: Field<T> | null | undefined): T | null {
  return entry?.state === 'known' ? entry.value : null;
}

// The source and grade a rule result carries, taken from the content value it used.
export type RuleBasis = Pick<Fact<unknown>, 'source' | 'lastChecked' | 'grade'>;

export function basisOf(value: RuleBasis): RuleBasis {
  return { source: value.source, lastChecked: value.lastChecked, grade: value.grade };
}
