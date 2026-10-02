import {
  chainStatus,
  isBefore,
  isOnOrAfter,
  passportValidity,
  stageChain,
  stateFor,
  type StageCheck,
  type StageContext,
} from '@boasis/rules';
import type { AuthorityFile, CardState, Document, IsoDate, Person } from '@boasis/schema';
import { federalRules } from '../content/federal';

// What the people screens read from packages/rules, in the two words lite uses on a person's
// line. Nothing here computes a date: it asks the rules and names the answer.

// Lite's two conditions that stop a renewal: the passport and the health insurance. "blocks"
// means the renewal will not go through as things stand; "missing" means the date is not
// recorded, so the person is outside the check.
export type Flag = 'blocks' | 'missing' | null;

export interface PersonFlags {
  passport: Flag;
  insurance: Flag;
}

export function personFlags(
  person: Person,
  authority: AuthorityFile | null,
  today: IsoDate,
): PersonFlags {
  // Spec 6.3: passport validity is checked at renewal, so the visa expiry is the reference day;
  // a person with no visa yet is checked for a new visa, today. Without a deep authority file
  // the rule has no months to check against and stays silent.
  const renewal = person.status.visaExpiry;
  const validity =
    authority === null
      ? null
      : renewal === null
        ? passportValidity(person, authority, federalRules, today, 'new')
        : passportValidity(person, authority, federalRules, renewal, 'renewal');
  const passport: Flag =
    person.identity.passportExpiry === null ? 'missing' : validity?.ok === false ? 'blocks' : null;

  const policy = person.cover.healthInsurance;
  let insurance: Flag = null;
  if (policy === null) {
    insurance = 'missing';
  } else if (
    isBefore(policy.endDate, today) ||
    (renewal !== null && isBefore(policy.endDate, renewal))
  ) {
    // Spec 6.2 stage 5: the policy must be in force before the residency application.
    insurance = 'blocks';
  }
  return { passport, insurance };
}

// Spec 7.1 through stateFor: the visa expiry read with the people lead time of 90 days.
export const VISA_LEAD_DAYS = 90;

export function visaState(person: Person, today: IsoDate): CardState | null {
  const dueOn = person.status.visaExpiry;
  if (dueOn === null) {
    return null;
  }
  return stateFor({ dueOn, today, leadDays: VISA_LEAD_DAYS });
}

// Lite colours a person's line once the date is close: under 30 days, or passed.
export function isSoon(state: CardState | null): boolean {
  return state === 'expiring' || state === 'overdue';
}

// Spec 6.3 "Leave the company": the contract end is the leaving date. A person whose contract
// ended on or before today has left; their record stays (lite archives, never deletes).
export function hasLeft(person: Person, today: IsoDate): boolean {
  return person.status.contractEnd !== null && isOnOrAfter(today, person.status.contractEnd);
}

export function stagesOf(
  person: Person,
  authority: AuthorityFile,
  documents: readonly Document[],
  today: IsoDate,
): { chain: StageCheck[]; status: ReturnType<typeof chainStatus> } {
  const context: StageContext = { authority, documents, today };
  return { chain: stageChain(person, context), status: chainStatus(person, context) };
}
