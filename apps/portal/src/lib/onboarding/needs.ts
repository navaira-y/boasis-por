import type {
  AccountPerson,
  CompanyFacts,
  Field,
  OnboardingItem,
  OnboardingStep,
  Role,
  WhoCanAnswer,
} from '@boasis/schema';
import { firstTaxPeriod } from '@boasis/rules';
import { federalRules } from '../../content/federal';
import type { OpenItem } from '../../data/types';

// Onboarding v2 sections B.2, B.3 and step 8 "We still need": every item a step leaves unknown
// or skipped, with who can answer it. The tasks are synced from this list after each step, so a
// task closes by itself once its item is answered.

// The items each step is answerable for. Syncing a step closes only its own items.
export const STEP_ITEMS: Readonly<Partial<Record<OnboardingStep, readonly OnboardingItem[]>>> = {
  company: [
    'legal-form',
    'licence-issue-date',
    'licence-expiry-date',
    'expected-new-expiry',
    'incorporation-date',
    'activities',
    'handler',
  ],
  people: ['people', 'passport-expiry', 'visa-expiry', 'emirates-id-expiry'],
  office: ['office-type', 'lease-end', 'renews-with-licence'],
  'establishment-card': ['establishment-card', 'visa-quota', 'visas-used'],
  'corporate-tax': [
    'corporate-tax-registration',
    'first-tax-period-end',
    'financial-year-end',
    'qfzp',
  ],
  vat: ['vat-registration', 'vat-filing-period', 'vat-period-end', 'vat-threshold'],
};

// Who can answer each item (section B.6: you, your agent, your accountant, the zone, the FTA).
export const WHO_CAN_ANSWER: Readonly<Record<OnboardingItem, readonly WhoCanAnswer[]>> = {
  'legal-form': ['you'],
  'licence-issue-date': ['you'],
  'licence-expiry-date': ['you'],
  'expected-new-expiry': ['zone', 'agent'],
  'incorporation-date': ['you'],
  activities: ['you'],
  handler: ['you'],
  people: ['you'],
  'passport-expiry': ['person'],
  'visa-expiry': ['person'],
  'emirates-id-expiry': ['person'],
  'office-type': ['you', 'zone'],
  'lease-end': ['you', 'zone'],
  'renews-with-licence': ['zone', 'agent'],
  'establishment-card': ['zone', 'agent'],
  'visa-quota': ['zone', 'agent'],
  'visas-used': ['you'],
  'corporate-tax-registration': ['accountant', 'fta'],
  'first-tax-period-end': ['accountant'],
  'financial-year-end': ['accountant'],
  qfzp: ['accountant'],
  'vat-registration': ['accountant', 'fta'],
  'vat-filing-period': ['accountant'],
  'vat-period-end': ['accountant'],
  'vat-threshold': ['accountant'],
};

function open(
  item: OnboardingItem,
  field: Field<unknown> | null | undefined,
  personId: string | null = null,
  onlyUnknown = false,
): OpenItem[] {
  if (field === null || field === undefined || field.state === 'known') {
    return [];
  }
  if (onlyUnknown && field.state !== 'unknown') {
    return [];
  }
  return [{ item, personId, reason: field.state, whoCanAnswer: WHO_CAN_ANSWER[item] }];
}

export function companyItems(facts: CompanyFacts): OpenItem[] {
  const profile = facts.profile ?? null;
  if (profile === null) {
    return [];
  }
  const inProgress =
    profile.licenceStatus.state === 'known' &&
    profile.licenceStatus.value === 'renewal-in-progress';
  return [
    ...open('legal-form', profile.legalForm),
    ...open('licence-issue-date', profile.licenceIssueDate),
    ...open('licence-expiry-date', profile.licenceExpiryDate),
    ...(inProgress ? open('expected-new-expiry', profile.expectedNewExpiry) : []),
    ...open('incorporation-date', profile.incorporationDate),
    ...open('activities', profile.activities),
    ...open('handler', profile.handler),
  ];
}

export interface CompanyPerson {
  readonly person: AccountPerson;
  readonly role: Role | null;
}

export function peopleItems(people: readonly CompanyPerson[]): OpenItem[] {
  const owners = people.filter((entry) => entry.role !== null);
  if (owners.length === 0) {
    return [{ item: 'people', personId: null, reason: 'skipped', whoCanAnswer: ['you'] }];
  }
  return owners.flatMap(({ person }) => [
    ...open('passport-expiry', person.passportExpiry, person.id),
    ...open('visa-expiry', person.residenceVisa.expiry, person.id),
    ...open('emirates-id-expiry', person.emiratesIdExpiry, person.id),
  ]);
}

export function employeeItems(people: readonly CompanyPerson[]): OpenItem[] {
  return people
    .filter((entry) => entry.role === null)
    .flatMap(({ person }) => [
      ...open('passport-expiry', person.passportExpiry, person.id),
      ...open('visa-expiry', person.residenceVisa.expiry, person.id),
      ...open('emirates-id-expiry', person.emiratesIdExpiry, person.id),
    ]);
}

export function officeItems(facts: CompanyFacts): OpenItem[] {
  const premises = facts.premises ?? null;
  if (premises === null) {
    return [];
  }
  const noOffice = premises.type.state === 'known' && premises.type.value === 'none';
  return [
    ...open('office-type', premises.type),
    ...(noOffice ? [] : open('lease-end', premises.endDate)),
    // Optional: only a "not sure" becomes a task.
    ...(noOffice ? [] : open('renews-with-licence', premises.renewsWithLicence, null, true)),
  ];
}

export function cardItems(facts: CompanyFacts): OpenItem[] {
  const card = facts.companyCards?.find((entry) => entry.kind === 'establishment') ?? null;
  const quota = facts.visaQuota ?? null;
  return [
    ...open('establishment-card', card?.expiry),
    ...open('visa-quota', quota?.allowed),
    ...open('visas-used', quota?.used),
  ];
}

export function corporateTaxItems(facts: CompanyFacts): OpenItem[] {
  const record = facts.tax.corporateTaxRecord ?? null;
  if (record === null) {
    return [];
  }
  // Not registered: the first period end is calculated when the rule gives one date; otherwise
  // it stays unknown and the accountant is asked.
  const notRegistered = record.registered.state === 'known' && record.registered.value === 'no';
  const firstUnknown =
    notRegistered &&
    record.firstTaxPeriodEnd?.state !== 'known' &&
    firstTaxPeriod(facts.profile?.incorporationDate ?? null, record.financialYearEnd, federalRules)
      .kind !== 'calculated';
  return [
    ...open('corporate-tax-registration', record.registered),
    ...open('first-tax-period-end', record.firstTaxPeriodEnd),
    ...(firstUnknown
      ? [
          {
            item: 'first-tax-period-end' as const,
            personId: null,
            reason: 'unknown' as const,
            whoCanAnswer: WHO_CAN_ANSWER['first-tax-period-end'],
          },
        ]
      : []),
    ...open('financial-year-end', record.financialYearEnd),
    ...open('qfzp', record.qfzpIntent),
  ];
}

export function vatItems(facts: CompanyFacts): OpenItem[] {
  const record = facts.tax.vatRecord ?? null;
  if (record === null) {
    return [];
  }
  const band = record.last12MonthsBand;
  const next30 = record.expectsToPassMandatoryInNext30Days;
  const thresholdUnknown =
    (band !== null && band.state !== 'known') || (next30 !== null && next30.state !== 'known');
  const mandatoryAnyway =
    (band?.state === 'known' && band.value === 'above-375000') ||
    (next30?.state === 'known' && next30.value === 'yes');
  return [
    ...open('vat-registration', record.registered),
    ...open('vat-filing-period', record.filingPeriod),
    ...open('vat-period-end', record.periodEnd),
    ...(thresholdUnknown && !mandatoryAnyway
      ? [
          {
            item: 'vat-threshold' as const,
            personId: null,
            reason:
              band?.state === 'unknown' || next30?.state === 'unknown'
                ? ('unknown' as const)
                : ('skipped' as const),
            whoCanAnswer: WHO_CAN_ANSWER['vat-threshold'],
          },
        ]
      : []),
  ];
}
