import type { CompanyFacts, CompanyProfile, Field, IsoDate } from '@boasis/schema';
import { licenceRenewalDate } from './onboarding';

// The incorporation date lives in two places while CompanyIdentity still requires it: the
// onboarding answer (profile.incorporationDate, with its state and origin) and the company
// identity the older screens read. Every writer goes through these two functions so the two can
// never differ: a known answer is copied to the identity; an unknown or skipped answer leaves the
// identity as it was, and the rules then read the answer, not the identity.

export function withIncorporationDate(facts: CompanyFacts, entry: Field<IsoDate>): CompanyFacts {
  const profile = facts.profile ?? null;
  return {
    ...facts,
    identity:
      entry.state === 'known'
        ? { ...facts.identity, incorporationDate: entry.value }
        : facts.identity,
    ...(profile === null ? {} : { profile: { ...profile, incorporationDate: entry } }),
  };
}

export function withCompanyProfile(facts: CompanyFacts, profile: CompanyProfile): CompanyFacts {
  return withIncorporationDate({ ...facts, profile }, profile.incorporationDate);
}

// True when no known onboarding answer disagrees with the identity.
export function incorporationDatesAgree(facts: CompanyFacts): boolean {
  const entry = facts.profile?.incorporationDate;
  return entry?.state !== 'known' || entry.value === facts.identity.incorporationDate;
}

// The licence renewal date the cards use. A company with onboarding answers reads them: the
// expected new expiry while a renewal is in progress, else the expiry as entered, and null when
// the expiry was skipped or not known (the identity then holds no answer of the person's). A
// company without onboarding answers reads the identity.
export function licenceRenewalDateOf(facts: CompanyFacts): IsoDate | null {
  const profile = facts.profile ?? null;
  if (profile?.licenceExpiryDate === undefined) {
    return facts.identity.expiryDate;
  }
  return licenceRenewalDate(
    profile.licenceStatus,
    profile.licenceExpiryDate,
    profile.expectedNewExpiry,
  );
}
