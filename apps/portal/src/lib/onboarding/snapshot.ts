import type { CompanySnapshot, SnapshotPerson } from '@boasis/rules';
import type { AccountPerson, CompanyFacts, Role } from '@boasis/schema';
import type { CompanyPerson } from './needs';

// The onboarding answers of one company as packages/rules reads them: the dates so far and the
// year are computed from this, never stored.

export function snapshotPerson(person: AccountPerson, companyId?: string): SnapshotPerson {
  return {
    id: person.id,
    name: person.name,
    sponsoredHere: companyId !== undefined && sponsoredBy(person, companyId),
    passportExpiry: person.passportExpiry,
    visaExpiry: person.residenceVisa.expiry,
    emiratesIdExpiry: person.emiratesIdExpiry,
  };
}

// The people of one company: those with a role in it (owners and managers), then those whose visa
// it sponsors without a role (employees, step 9).
export function companyPeople(
  companyId: string,
  people: readonly AccountPerson[],
  roles: readonly Role[],
): CompanyPerson[] {
  const withRole = roles
    .filter((role) => role.companyId === companyId)
    .flatMap((role) => {
      const person = people.find((candidate) => candidate.id === role.personId);
      return person === undefined ? [] : [{ person, role }];
    });
  const roleIds = new Set(withRole.map((entry) => entry.person.id));
  const employees = people
    .filter((person) => !roleIds.has(person.id) && sponsoredBy(person, companyId))
    .filter((person) => !roles.some((role) => role.personId === person.id))
    .map((person) => ({ person, role: null }));
  return [...withRole, ...employees];
}

export function sponsoredBy(person: AccountPerson, companyId: string): boolean {
  const sponsor = person.residenceVisa.sponsor;
  return sponsor.kind === 'account-company' && sponsor.companyId === companyId;
}

// Step 5: the visas this company uses for the people on the account, the prefill for "visas
// used now".
export function sponsoredCount(companyId: string, people: readonly CompanyPerson[]): number {
  return people.filter((entry) => sponsoredBy(entry.person, companyId)).length;
}

export function snapshotOf(facts: CompanyFacts, people: readonly CompanyPerson[]): CompanySnapshot {
  const profile = facts.profile ?? null;
  return {
    companyId: facts.id,
    licenceStatus: profile?.licenceStatus ?? null,
    licenceExpiry: profile?.licenceExpiryDate ?? null,
    expectedNewExpiry: profile?.expectedNewExpiry ?? null,
    incorporationDate: profile?.incorporationDate ?? null,
    premises: facts.premises ?? null,
    establishmentCard:
      facts.companyCards?.find((card) => card.kind === 'establishment')?.expiry ?? null,
    corporateTax: facts.tax.corporateTaxRecord ?? null,
    vat: facts.tax.vatRecord ?? null,
    people: people.map((entry) => snapshotPerson(entry.person, facts.id)),
  };
}

// A step's live answers laid over the saved ones, so the side panel fills in while typing.
export function withPreview(
  base: CompanySnapshot,
  preview: Partial<CompanySnapshot>,
): CompanySnapshot {
  return { ...base, ...preview, companyId: base.companyId };
}
