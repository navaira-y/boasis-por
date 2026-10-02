import {
  addMonths,
  chainStatus,
  daysUntil,
  findRequirement,
  isBefore,
  isSponsoredByCompany,
  passportValidity,
  questionsToAsk,
  type Requirement,
  type RequirementKey,
  type Question,
} from '@boasis/rules';
import type {
  AccessGrant,
  AuthorityFile,
  Card,
  CardState,
  DocumentType,
  FeeLine,
  IsoDate,
  Person,
  QuestionId,
} from '@boasis/schema';
import { federalRules } from '../content/federal';
import { compliance } from '../copy/en';
import { companyAccessOf } from './access';
import { daysLabel, type Bundle } from './entries';
import { formatShort } from './format';

// The licence renewal fee of one company from the authority file's fee lines. Several lines are
// the authority's packages, and the company's own package is not recorded, so the fee is
// unknown (null), never their sum. One line is the fee.
export function licenceFeeOf(fees: readonly FeeLine[] | null): FeeLine | null {
  return fees !== null && fees.length === 1 ? (fees[0] ?? null) : null;
}

// What the compliance screens say about one card, read from the bundle and the catalogue.
// Nothing here decides a state or a date: that is packages/rules. This names what it decided.

// Spec 14 screen 14: the three trackers, each a playbook of the authority file.
export type TrackerId = 'renewal' | 'cancellation' | 'amendment';
export const TRACKER_IDS: readonly TrackerId[] = ['renewal', 'cancellation', 'amendment'];

// The authority file names its playbooks by the spec's events (5.6): licence-renewal,
// company-cancellation, licence-amendment, visa-stages, leaving. Which one a requirement follows.
export function playbookIdFor(requirement: Requirement): string | null {
  switch (requirement.key) {
    case 'licence-renewal':
      return 'licence-renewal';
    case 'activity-change':
    case 'manager-or-signatory-change':
    case 'office-move':
    case 'quota-increase':
    case 'ownership-change':
      return 'licence-amendment';
    case 'resolution-and-liquidator':
    case 'cancel-employee-visas':
    case 'cancel-partner-visas-and-cards':
    case 'vat-deregistration':
    case 'corporate-tax-deregistration':
    case 'clearances':
    case 'hand-back-office':
    case 'close-bank-account':
    case 'cancellation-certificate':
      return 'company-cancellation';
    case 'visa-stages':
    case 'owner-or-partner-visa':
    case 'dependant-sponsorship':
    case 'residency-completed':
    case 'labour-contract-registered':
      return 'visa-stages';
    case 'leaving':
      return 'leaving';
    default:
      return null;
  }
}

export const TRACKER_PLAYBOOK: Readonly<Record<TrackerId, string>> = {
  renewal: 'licence-renewal',
  cancellation: 'company-cancellation',
  amendment: 'licence-amendment',
};

// The steps of a playbook as the file states them, or null when the file has none or holds the
// playbook as unknown (rule 3: unknown, never a guess).
export function playbookSteps(
  authority: AuthorityFile,
  playbookId: string | null,
): string[] | null {
  if (playbookId === null) {
    return null;
  }
  const playbook = authority.playbooks.find((entry) => entry.requirementId === playbookId);
  const steps = playbook?.steps.value ?? null;
  return steps === null || steps.length === 0 ? null : steps;
}

export function playbookSource(authority: AuthorityFile, playbookId: string | null): string | null {
  if (playbookId === null) {
    return null;
  }
  return (
    authority.playbooks.find((entry) => entry.requirementId === playbookId)?.steps.source ?? null
  );
}

// The tracker a card leads to, when its requirement is one of the three tracked sequences.
export function trackerFor(requirement: Requirement): TrackerId | null {
  switch (playbookIdFor(requirement)) {
    case 'licence-renewal':
      return 'renewal';
    case 'company-cancellation':
      return 'cancellation';
    case 'licence-amendment':
      return 'amendment';
    default:
      return null;
  }
}

// The library entry the file points a requirement at (spec 8), as the id of the entry page. The
// file keys some entries by the spec's older names; the aliases match those to the catalogue.
const LIBRARY_ALIASES: Readonly<Partial<Record<RequirementKey, string>>> = {
  'activity-change': 'licence-amendment',
  'manager-or-signatory-change': 'licence-amendment',
  'office-move': 'licence-amendment',
  'quota-increase': 'licence-amendment',
  'cancellation-certificate': 'company-cancellation',
  'resolution-and-liquidator': 'company-cancellation',
  clearances: 'company-cancellation',
  'hand-back-office': 'company-cancellation',
  'close-bank-account': 'company-cancellation',
  'cancel-employee-visas': 'company-cancellation',
  'cancel-partner-visas-and-cards': 'company-cancellation',
  'wages-pay-date': 'wages',
  'wps-registration': 'wages',
  emiratisation: 'emiratisation-targets',
  'corporate-tax-return': 'corporate-tax-registration',
  'vat-return': 'vat-registration',
  'turnover-question': 'vat-registration',
  'ubo-confirmation': 'ubo-declaration',
  'ownership-change': 'ubo-declaration',
  'ejari-renewal': 'office-lease-and-ejari',
  'office-lease-renewal': 'office-lease-and-ejari',
  'rent-instalment': 'office-lease-and-ejari',
  'health-insurance-renewal': 'health-insurance-policy',
  'residence-visa-renewal': 'visa-stages',
  'emirates-id-renewal': 'visa-stages',
  'work-permit-renewal': 'visa-stages',
  'passport-expiry': 'visa-stages',
  'residency-completed': 'visa-stages',
  'owner-or-partner-visa': 'visa-stages',
  'dependant-sponsorship': 'visa-stages',
  'unemployment-insurance': 'labour-contract-registered',
  'send-licence-to-bank': 'bank-account',
  'bank-kyc-refresh': 'bank-account',
  'immigration-card': 'licence-renewal',
  'immigration-card-renewal': 'licence-renewal',
  'mohre-registration': 'licence-renewal',
  'mohre-card-renewal': 'licence-renewal',
};

export function libraryEntryIdFor(
  authority: AuthorityFile,
  requirement: Requirement,
): string | null {
  const wanted = LIBRARY_ALIASES[requirement.key] ?? requirement.key;
  const ref = authority.library.find((entry) => entry.requirementId === wanted);
  if (ref === undefined) {
    return null;
  }
  const name = ref.entryPath.split('/').pop() ?? '';
  return name.replace(/\.md$/, '') || null;
}

// The paper that closes a card (spec 7.3): the new document its requirement produces. Null when the
// requirement closes on a reference only.
const PROOF_TYPE: Readonly<Partial<Record<RequirementKey, DocumentType>>> = {
  'licence-renewal': 'licence',
  'immigration-card': 'establishment-card',
  'immigration-card-renewal': 'establishment-card',
  'mohre-registration': 'establishment-card',
  'mohre-card-renewal': 'establishment-card',
  'e-signature-card-renewal': 'e-signature-card',
  'chamber-membership': 'chamber-certificate',
  'chamber-renewal': 'chamber-certificate',
  'office-lease-and-ejari': 'ejari-certificate',
  'office-lease-renewal': 'lease',
  'ejari-renewal': 'ejari-certificate',
  'rent-instalment': 'deposit-receipt',
  'audited-accounts': 'audited-accounts',
  'corporate-tax-registration': 'tax-certificate',
  'corporate-tax-return': 'corporate-tax-return',
  'vat-registration': 'tax-certificate',
  'vat-return': 'vat-return',
  'ubo-declaration': 'ubo-declaration',
  'ubo-confirmation': 'ubo-declaration',
  'ownership-change': 'ubo-declaration',
  'health-insurance-policy': 'insurance-policy',
  'health-insurance-renewal': 'insurance-policy',
  'residence-visa-renewal': 'visa',
  'emirates-id-renewal': 'emirates-id',
  'work-permit-renewal': 'work-permit',
  'passport-expiry': 'passport',
  'labour-contract-registered': 'labour-contract',
  'unemployment-insurance': 'unemployment-insurance-certificate',
  'wages-pay-date': 'wages-file',
  'send-licence-to-bank': 'bank-letter',
  'bank-kyc-refresh': 'bank-letter',
  'general-assembly': 'board-resolution',
  'resolution-and-liquidator': 'liquidator-appointment',
  'cancellation-certificate': 'cancellation-certificate',
  'company-stamp-and-signatory-letters': 'signatory-letter',
  'visa-stages': 'visa',
  'owner-or-partner-visa': 'visa',
  'dependant-sponsorship': 'visa',
  'residency-completed': 'visa',
  'activity-change': 'amended-licence',
  'manager-or-signatory-change': 'amended-licence',
  'office-move': 'amended-licence',
  'quota-increase': 'amended-licence',
};

export function proofTypeOf(requirement: Requirement | null): DocumentType | null {
  return requirement === null ? null : (PROOF_TYPE[requirement.key] ?? null);
}

export function requirementOf(card: Card): Requirement | null {
  return findRequirement(card.requirementId);
}

// What the card is about: the person, the office, the bank, the activity or the document.
export interface CardSubject {
  readonly name: string | null;
  readonly person: Person | null;
}

export function subjectOf(card: Card, bundle: Bundle): CardSubject {
  const id = card.subjectId ?? null;
  if (id === null || id === bundle.facts.id) {
    return { name: null, person: null };
  }
  const person = bundle.people.find((entry) => entry.id === id);
  if (person !== undefined) {
    return { name: person.identity.name, person };
  }
  const office = bundle.offices.find((entry) => entry.id === id);
  if (office !== undefined) {
    return { name: office.premises.address, person: null };
  }
  const bank = (bundle.facts.banks ?? []).find((entry) => entry.id === id);
  if (bank !== undefined) {
    return { name: bank.bankName, person: null };
  }
  const activity = bundle.facts.identity.activities.find((entry) => entry.code === id);
  if (activity !== undefined) {
    return { name: activity.name, person: null };
  }
  const document = bundle.documents.find((entry) => entry.id === id);
  if (document !== undefined) {
    return { name: document.title, person: null };
  }
  return { name: id, person: null };
}

export function cardTitle(card: Card, bundle: Bundle): string {
  const requirement = requirementOf(card);
  const base = requirement?.title ?? card.requirementId;
  const subject = subjectOf(card, bundle);
  return subject.name === null ? base : `${base} · ${subject.name}`;
}

// The one line under a card's title: the date and the days, or why there is no date.
export function cardLine(card: Card, today: IsoDate): string {
  if (card.state === 'complete') {
    const doneOn = card.steps.find((step) => step.done)?.doneOn ?? card.dueOn;
    return compliance.line.done(formatShort(doneOn));
  }
  if (card.dueOn !== null) {
    return `${compliance.line.due(formatShort(card.dueOn))} · ${daysLabel(daysUntil(card.dueOn, today))}`;
  }
  if (card.state === 'unknown') {
    return compliance.line.unknown;
  }
  return compliance.line.pending;
}

// Spec 4.1: the member responsible for the card's area in this company, else the card's own
// responsible person, else unassigned.
export interface Responsible {
  readonly name: string;
  readonly grant: AccessGrant | null;
}

export function responsibleOf(card: Card, grants: readonly AccessGrant[]): Responsible {
  const named =
    card.responsibleId === null ? undefined : grants.find((g) => g.id === card.responsibleId);
  if (named !== undefined) {
    return { name: named.member.name, grant: named };
  }
  for (const grant of grants) {
    const access = companyAccessOf(grant, card.companyId);
    if (access?.areas[card.area]?.responsible === true) {
      return { name: grant.member.name, grant };
    }
  }
  return { name: compliance.unassigned, grant: null };
}

// Who a card's reminders go to, by the rule the card page shows: the assignee of the first step
// still open, else the responsible person, else null for every owner (spec 4.1 and 9).
export function recipientOf(card: Card, grants: readonly AccessGrant[]): string | null {
  const assigneeId = card.steps.find((step) => !step.done && step.assigneeId !== null)?.assigneeId;
  const assignee =
    assigneeId === undefined ? undefined : grants.find((grant) => grant.id === assigneeId);
  if (assignee !== undefined) {
    return assignee.member.name;
  }
  const responsible = responsibleOf(card, grants);
  return responsible.grant === null ? null : responsible.name;
}

// Everyone with access to this company: the assignee choices of a step.
export function membersOf(grants: readonly AccessGrant[], companyId: string): AccessGrant[] {
  return grants.filter((grant) => companyAccessOf(grant, companyId) !== null);
}

// Spec 7.2 Visas and IDs: "the blocked stage". A person's card is blocked when something the
// rules check is missing or lapsed: a passport too short for the renewal, no insurance in
// force, unemployment insurance dues, or a stage in the chain that cannot proceed.
export function isBlocked(card: Card, bundle: Bundle, today: IsoDate): boolean {
  const requirement = requirementOf(card);
  const { person } = subjectOf(card, bundle);
  if (requirement === null || person === null || card.state === 'complete') {
    return false;
  }
  switch (requirement.key) {
    case 'residence-visa-renewal': {
      if (passportValidity(person, bundle.authority, federalRules, today, 'renewal').ok === false) {
        return true;
      }
      if (isSponsoredByCompany(person)) {
        const policy = person.cover.healthInsurance;
        if (policy === null || isBefore(policy.endDate, today)) {
          return true;
        }
      }
      return person.cover.unemploymentInsurance?.duesOutstanding === true;
    }
    case 'passport-expiry': {
      const expiry = person.identity.passportExpiry;
      const visaExpiry = person.status.visaExpiry;
      const required = federalRules.passport.residenceRenewalMonths.value;
      return (
        expiry !== null && visaExpiry !== null && isBefore(expiry, addMonths(visaExpiry, required))
      );
    }
    case 'visa-stages':
    case 'owner-or-partner-visa':
    case 'dependant-sponsorship':
      return (
        chainStatus(person, { authority: bundle.authority, documents: bundle.documents, today })
          .blocked.length > 0
      );
    case 'unemployment-insurance':
      return person.cover.unemploymentInsurance?.duesOutstanding === true;
    default:
      return false;
  }
}

// The fact an "unknown" card is waiting for, when it is one of the closed question list
// (packages/rules questionsToAsk). The requirement names the question; the resolver says if it is
// still open.
const QUESTION_OF: Readonly<Partial<Record<RequirementKey, QuestionId>>> = {
  'audited-accounts': 'auditRequiredForRenewal',
  'wps-registration': 'wpsApplies',
  'wages-pay-date': 'wpsApplies',
  'office-lease-and-ejari': 'ejariRequired',
  'ejari-renewal': 'ejariRequired',
  'general-assembly': 'generalAssemblyRequired',
};

export function questionFor(card: Card, bundle: Bundle): Question | null {
  const requirement = requirementOf(card);
  if (requirement === null || card.state !== 'unknown') {
    return null;
  }
  const wanted = QUESTION_OF[requirement.key];
  if (wanted === undefined) {
    return null;
  }
  const open = questionsToAsk({
    facts: bundle.facts,
    authority: bundle.authority,
    documents: bundle.documents,
  });
  return open.find((question) => question.id === wanted) ?? null;
}

// Why an unknown card has no question of its own: the fact lives in the company file or the
// person record, and the card says which.
export function unknownReason(card: Card, bundle: Bundle): string {
  const requirement = requirementOf(card);
  switch (requirement?.key) {
    case 'vat-registration':
      return compliance.unknownWhy.vat;
    case 'vat-return':
      return compliance.unknownWhy.vatPeriod;
    case 'bank-kyc-refresh':
      return compliance.unknownWhy.kyc;
    case 'bank-account':
      return compliance.unknownWhy.bank;
    case 'ubo-declaration':
      return compliance.unknownWhy.ubo;
    case 'unemployment-insurance':
      return compliance.unknownWhy.unemployment;
    case 'passport-expiry':
      return compliance.unknownWhy.passport;
    case 'visa-stages':
    case 'owner-or-partner-visa':
    case 'dependant-sponsorship':
      return compliance.unknownWhy.permit(bundle.authority.identity.name.value ?? '');
    case 'emiratisation':
      return compliance.unknownWhy.emiratisation;
    default:
      return compliance.unknownWhy.file(bundle.authority.identity.name.value ?? '');
  }
}

// The board's filters. "urgent" is overdue plus blocked (spec 7.1 red, spec 7.2 blocked).
export type StateFilter = 'all' | 'urgent' | CardState;
export const STATE_FILTERS: readonly StateFilter[] = [
  'all',
  'urgent',
  'overdue',
  'expiring',
  'action-soon',
  'decision-needed',
  'unknown',
  'on-track',
  'complete',
];

export function isStateFilter(value: string | null): value is StateFilter {
  return value !== null && (STATE_FILTERS as readonly string[]).includes(value);
}

export function matchesFilter(
  card: Card,
  filter: StateFilter,
  bundle: Bundle,
  today: IsoDate,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'urgent':
      return card.state === 'overdue' || isBlocked(card, bundle, today);
    default:
      return card.state === filter;
  }
}
