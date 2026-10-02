import type {
  AuthorityFile,
  CompanyDecision,
  CompanyFacts,
  Document,
  RequirementId,
  Office,
  Person,
} from '@boasis/schema';
import { isBefore } from './calendar';
import { REQUIREMENTS, type AppliesWhen, type Requirement } from './requirements';
import { resolveFact, type ResolveContext, type Resolved } from './resolve';

// Which requirements apply to these facts under this authority file (spec 11, 11A, 18.1). A fact
// that neither a document, the file nor an answer carries yields "unknown": the requirement stays
// applicable and its card asks for the fact.
export type Applicability = 'yes' | 'no' | 'unknown';

// The facts, the authority file and the documents the resolver reads (build plan 3A), plus the
// premises and the people the per-office and per-person requirements need (spec 7.2).
export interface CompanyContext extends ResolveContext {
  offices: readonly Office[];
  people: readonly Person[];
}

// A resolved flag as an applicability: unknown asks, it never drops the requirement (spec 7.1).
function fromResolved(resolved: Resolved<boolean>): Applicability {
  if (resolved.value === null) {
    return 'unknown';
  }
  return resolved.value ? 'yes' : 'no';
}

function fromBoolean(value: boolean): Applicability {
  return value ? 'yes' : 'no';
}

// Spec 7.2 Health insurance: only when the company sponsors at least one person.
export function isSponsoredByCompany(person: Person): boolean {
  return person.status.sponsor.kind === 'company';
}

export function hasSponsoredPeople(people: readonly Person[]): boolean {
  return people.some(isSponsoredByCompany);
}

// The decision answer for the current licence cycle (spec 10); an answer for an older expiry
// does not count.
export function currentDecision(facts: CompanyFacts): CompanyDecision | null {
  const decision = facts.decision ?? null;
  return decision?.forExpiry === facts.identity.expiryDate ? decision : null;
}

// Spec 11.5 and 11.1: an ownership change is open while the UBO declaration predates it.
export function ownershipChangeOpen(facts: CompanyFacts): boolean {
  const ubo = facts.ubo ?? null;
  const change = ubo?.lastOwnershipChangeOn ?? null;
  if (ubo === null || change === null) {
    return false;
  }
  return ubo.declaredOn === null || isBefore(ubo.declaredOn, change);
}

// Spec 11.5 and 5.6: an activity added or removed after the licence on file was issued is an
// amendment still to be reflected; uploading the amended licence moves the issue date past it.
export function activityChangeOpen(facts: CompanyFacts): boolean {
  const issued = facts.identity.issueDate;
  return facts.identity.activities.some(
    (activity) =>
      isBefore(issued, activity.addedOn) ||
      (activity.removedOn !== null && isBefore(issued, activity.removedOn)),
  );
}

export function activeActivityCodes(facts: CompanyFacts): string[] {
  return facts.identity.activities
    .filter((activity) => activity.removedOn === null)
    .map((activity) => activity.code);
}

// Spec 11.1 AML registration: only for activities in the file's list (11A company requirements).
export function amlApplies(facts: CompanyFacts, authority: AuthorityFile): Applicability {
  const list = authority.companyRequirements.amlActivities?.value ?? undefined;
  if (list === undefined) {
    return 'unknown';
  }
  return fromBoolean(activeActivityCodes(facts).some((code) => list.includes(code)));
}

// Spec 11.1 and 5.6: the permit list in the authority file does the matching in MVP 1.
export function sectorPermitCodes(facts: CompanyFacts, authority: AuthorityFile): string[] | null {
  const list = authority.companyRequirements.sectorPermits?.value ?? undefined;
  if (list === undefined) {
    return null;
  }
  const wanted = new Set(list.map((entry) => entry.activityCode));
  return activeActivityCodes(facts).filter((code) => wanted.has(code));
}

// Build plan 3A: the documents, then the authority file (spec 11A names the audit in the licence
// prerequisites and the company requirements), then the owner's answer, then unknown.
export function auditRequired(context: ResolveContext): Applicability {
  return fromResolved(resolveFact('auditRequiredForRenewal', context));
}

export function ejariRequired(context: ResolveContext): Applicability {
  return fromResolved(resolveFact('ejariRequired', context));
}

// Spec 11.2: a general assembly where the authority's rule or the owner says the company holds one.
export function generalAssemblyRequired(context: ResolveContext): Applicability {
  return fromResolved(resolveFact('generalAssemblyRequired', context));
}

// Spec 11.3: mainland and JAFZA confirmed, other zones per file. The documents, the file (the
// mainland is in without a flag), then the owner's answer; a person recorded under WPS settles
// what is still unknown, and otherwise it is unknown.
export function wpsApplies(context: CompanyContext): Applicability {
  const resolved = fromResolved(resolveFact('wpsApplies', context));
  if (resolved !== 'unknown') {
    return resolved;
  }
  return context.people.some((person) => person.pay.underWps === true) ? 'yes' : 'unknown';
}

// Spec 11.2: Emiratisation is a mainland requirement; the file says if this authority is in scope.
export function emiratisationApplies(authority: AuthorityFile): Applicability {
  const flag = authority.people.emiratisationInScope?.value ?? undefined;
  if (flag !== undefined) {
    return fromBoolean(flag);
  }
  return authority.identity.type.value === 'mainland' ? 'unknown' : 'no';
}

function combine(results: readonly Applicability[]): Applicability {
  if (results.includes('no')) {
    return 'no';
  }
  return results.includes('unknown') ? 'unknown' : 'yes';
}

// Evaluates one predicate. With a person, the person-level keys judge that person; without one
// they judge whether any person in the company matches.
export function evaluateApplies(
  when: AppliesWhen,
  context: CompanyContext,
  person: Person | null = null,
): Applicability {
  const results: Applicability[] = [];
  const { facts, authority, people } = context;
  if (when.authorityType !== undefined) {
    results.push(fromBoolean(authority.identity.type.value === when.authorityType));
  }
  if (when.legalForm !== undefined) {
    results.push(fromBoolean(when.legalForm.includes(facts.identity.legalForm)));
  }
  if (when.hasSponsoredPeople === true) {
    results.push(
      fromBoolean(person === null ? hasSponsoredPeople(people) : isSponsoredByCompany(person)),
    );
  }
  if (when.personType !== undefined) {
    const types = when.personType;
    results.push(
      fromBoolean(
        person === null
          ? people.some((entry) => types.includes(entry.status.type))
          : types.includes(person.status.type),
      ),
    );
  }
  if (when.vat !== undefined) {
    results.push(fromBoolean(facts.tax.vat.status === when.vat));
  }
  if (when.corporateTaxRegistered === true) {
    results.push(fromBoolean(facts.tax.corporateTax.registered));
  }
  if (when.auditRequired === true) {
    results.push(auditRequired(context));
  }
  if (when.ejariRequired === true) {
    results.push(ejariRequired(context));
  }
  if (when.generalAssembly === true) {
    results.push(generalAssemblyRequired(context));
  }
  if (when.wps === true) {
    results.push(wpsApplies(context));
  }
  if (when.emiratisation === true) {
    results.push(emiratisationApplies(authority));
  }
  if (when.amlActivity === true) {
    results.push(amlApplies(facts, authority));
  }
  if (when.sectorPermit === true) {
    const codes = sectorPermitCodes(facts, authority);
    results.push(codes === null ? 'unknown' : fromBoolean(codes.length > 0));
  }
  if (when.decision !== undefined) {
    results.push(fromBoolean(currentDecision(facts)?.answer === when.decision));
  }
  if (when.ownershipChanged === true) {
    results.push(fromBoolean(ownershipChangeOpen(facts)));
  }
  if (when.activityChanged === true) {
    results.push(fromBoolean(activityChangeOpen(facts)));
  }
  return combine(results);
}

export interface RequirementApplicability {
  requirement: Requirement;
  applicability: Applicability;
}

// Every requirement in the catalogue with its applicability to this company.
export function classifyRequirements(context: CompanyContext): RequirementApplicability[] {
  return REQUIREMENTS.map((requirement) => ({
    requirement,
    applicability: evaluateApplies(requirement.appliesWhen, context),
  }));
}

// The requirement ids that apply: "yes" and "unknown" both count, because an unknown is a card that
// asks for the missing fact (spec 7.1, 18.1), never a requirement dropped in silence.
export function applicableRequirements(
  facts: CompanyFacts,
  offices: readonly Office[],
  people: readonly Person[],
  authority: AuthorityFile,
  documents: readonly Document[] = [],
): RequirementId[] {
  return classifyRequirements({ facts, offices, people, authority, documents })
    .filter((entry) => entry.applicability !== 'no')
    .map((entry) => entry.requirement.id);
}

// The Brain seam (packages/assistant, build plan section 4). A classifier says which requirements
// apply to a company and whether each is certain or still needs a fact. MVP 1 uses the authority
// file; the full launch swaps in the Brain per company without a change in packages/rules.
export interface ClassifierInput {
  facts: CompanyFacts;
  offices: readonly Office[];
  people: readonly Person[];
  documents: readonly Document[];
}

export interface RequirementDecision {
  requirementId: RequirementId;
  // "unknown" keeps the requirement as a card that asks for the missing fact (spec 7.1, 18.1).
  applicability: 'yes' | 'unknown';
}

export interface RequirementClassifierLike {
  classify(input: ClassifierInput, authority: AuthorityFile): RequirementDecision[];
  applicableRequirements(input: ClassifierInput, authority: AuthorityFile): RequirementId[];
}

function classifyWithFile(input: ClassifierInput, authority: AuthorityFile): RequirementDecision[] {
  return classifyRequirements({ ...input, authority })
    .filter((entry) => entry.applicability !== 'no')
    .map((entry) => ({
      requirementId: entry.requirement.id,
      applicability: entry.applicability === 'yes' ? 'yes' : 'unknown',
    }));
}

export const authorityFileClassifier: RequirementClassifierLike = {
  classify: classifyWithFile,
  applicableRequirements(input, authority): RequirementId[] {
    return classifyWithFile(input, authority).map((decision) => decision.requirementId);
  },
};
