import {
  RequirementId,
  type Area,
  type DecisionAnswer,
  type LegalForm,
  type PersonType,
  type VatStatus,
} from '@boasis/schema';

// The requirement catalogue: every row of spec section 11 as a typed record. Each value taken from
// the spec carries a comment naming the section. Fines are not a feature (spec 11): penaltyNote is
// always null and the library carries that text.

export type RequirementGroup = 'day0' | 'yearly' | 'periodic' | 'people' | 'change' | 'exit';

export type TriggerKind =
  | 'licenceExpiry'
  | 'cardExpiry'
  | 'leaseEnd'
  | 'rentInstalment'
  | 'yearEnd'
  | 'taxPeriodEnd'
  | 'visaExpiry'
  | 'emiratesIdExpiry'
  | 'passportExpiry'
  | 'workPermitExpiry'
  | 'insuranceEnd'
  | 'entryDate'
  | 'probationEnd'
  | 'lastExit'
  | 'payDay'
  | 'ownershipChange'
  | 'activityChange'
  | 'onboarding'
  | 'decision'
  // A card opened by an event the facts do not carry a date for (spec 11.5 and 11.6): the app
  // opens it, the engine keeps it and judges its date.
  | 'event'
  // The KYC refresh date a bank set (spec 11.2 Bank KYC refresh).
  | 'kycDate';

export type Recurrence = 'none' | 'yearly' | 'monthly' | 'quarterly' | 'perPerson';

// What one card is about. Spec 7.2: per person, per premises, per account; rent per instalment
// (11.1); sector permits per activity (11.1); e-signature cards per signatory card (11.2).
export type RequirementSubject =
  'company' | 'person' | 'office' | 'instalment' | 'bank' | 'activity' | 'document';

// Spec 11: "Items marked verify are from memory or a single source". 'reported' is that mark;
// 'confirmed' is the spec's own word on the row; 'stated' is a row with neither mark.
export type RequirementGrade = 'confirmed' | 'stated' | 'reported';

// The applicability predicate as data. Every key is a fact or an authority-file flag; a missing
// file flag makes the requirement applicable with state unknown, never silently dropped.
export interface AppliesWhen {
  authorityType?: 'mainland' | 'free-zone';
  legalForm?: readonly LegalForm[];
  hasSponsoredPeople?: true;
  personType?: readonly PersonType[];
  vat?: VatStatus;
  corporateTaxRegistered?: true;
  auditRequired?: true;
  ejariRequired?: true;
  // Spec 11.2: the authority's general assembly rule, or the owner's answer, says it is held.
  generalAssembly?: true;
  wps?: true;
  emiratisation?: true;
  amlActivity?: true;
  sectorPermit?: true;
  decision?: DecisionAnswer;
  ownershipChanged?: true;
  activityChanged?: true;
  // Opened by an event the facts cannot derive; applicable to every company of the authority.
  event?: true;
}

export interface Requirement {
  id: RequirementId;
  key: RequirementKey;
  title: string;
  area: Area;
  group: RequirementGroup;
  subject: RequirementSubject;
  triggerKind: TriggerKind;
  defaultLeadDays: number;
  recurrence: Recurrence;
  appliesWhen: AppliesWhen;
  mvp: 1 | 2;
  grade: RequirementGrade;
  penaltyNote: null;
  // The spec section the row comes from.
  spec: string;
}

export const REQUIREMENT_KEYS = [
  // 11.1 Day 0
  'immigration-card',
  'mohre-registration',
  'zone-portal-registration',
  'chamber-membership',
  'office-lease-and-ejari',
  'rent-instalment',
  'utilities-and-telecom',
  'bank-account',
  'corporate-tax-registration',
  'vat-registration',
  'ubo-declaration',
  'company-stamp-and-signatory-letters',
  'owner-or-partner-visa',
  'health-insurance-policy',
  'wps-registration',
  'financial-year-end-chosen',
  'aml-registration',
  'sector-permit',
  // 11.2 Every year
  'decision-point',
  'mainland-llc-closing-prompt',
  'licence-renewal',
  'immigration-card-renewal',
  'mohre-card-renewal',
  'e-signature-card-renewal',
  'chamber-renewal',
  'office-lease-renewal',
  'ejari-renewal',
  'audited-accounts',
  'corporate-tax-return',
  'general-assembly',
  'send-licence-to-bank',
  'bank-kyc-refresh',
  'health-insurance-renewal',
  'emiratisation',
  'ubo-confirmation',
  // 11.3 Every month or quarter
  'wages-pay-date',
  'vat-return',
  'turnover-question',
  'end-of-service-accrual',
  // 11.4 People
  'visa-stages',
  'labour-contract-registered',
  'residency-completed',
  'unemployment-insurance',
  'residence-visa-renewal',
  'emirates-id-renewal',
  'work-permit-renewal',
  'passport-expiry',
  'probation-end',
  'absence-abroad',
  'leaving',
  'dependant-sponsorship',
  // 11.5 Changes
  'ownership-change',
  'manager-or-signatory-change',
  'activity-change',
  'office-move',
  'quota-increase',
  // 11.6 Exit
  'resolution-and-liquidator',
  'cancel-employee-visas',
  'cancel-partner-visas-and-cards',
  'vat-deregistration',
  'corporate-tax-deregistration',
  'clearances',
  'hand-back-office',
  'close-bank-account',
  'cancellation-certificate',
] as const;
export type RequirementKey = (typeof REQUIREMENT_KEYS)[number];

export function requirementId(key: RequirementKey): RequirementId {
  return RequirementId.parse(key);
}

// Spec 11: lead times are defaults; each authority file can override.
const LEAD = 90;
// Spec 11.1 rent instalments and 9: short requirements use 7 and 1 only.
const SHORT_LEAD = 7;
// Spec 5.6 and 19: the mainland LLC closing prompt fires at 180 days.
const CLOSING_PROMPT_LEAD = 180;

type RequirementInput = Omit<Requirement, 'id' | 'penaltyNote'>;

function requirement(input: RequirementInput): Requirement {
  return { ...input, id: requirementId(input.key), penaltyNote: null };
}

const MAINLAND = { authorityType: 'mainland' } as const;
// Spec 7: Licence, Establishment cards, Office and lease, Authority rules, UBO and AML sit under
// "licence and cards"; Visas, Health insurance, Wages, Emiratisation under "people"; Corporate
// tax, VAT, Audited accounts, Company records under "tax and accounts"; Banks under "banks".
const LICENCE: Area = 'licence-and-cards';
const PEOPLE: Area = 'people';
const TAX: Area = 'tax-and-accounts';
const BANKS: Area = 'banks';

export const REQUIREMENTS: readonly Requirement[] = [
  // 11.1 Day 0, after the licence is issued.
  requirement({
    key: 'immigration-card',
    title: 'Establishment immigration card',
    area: LICENCE,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: right after licence; needed before any visa
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: {},
    mvp: 1, // 18.2 Establishment cards
    grade: 'reported', // 11.1: validity differs by authority, verify per file
    spec: '11.1',
  }),
  requirement({
    key: 'mohre-registration',
    title: 'MOHRE registration and card',
    area: LICENCE,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: mainland only, before hiring
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: MAINLAND, // 11.1: free zones sponsor through the zone, not MOHRE
    mvp: 1, // 18.2 MOHRE card for mainland
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'zone-portal-registration',
    title: 'Zone portal or e-channel registration',
    area: LICENCE,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: right after licence, per zone file
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: {},
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'chamber-membership',
    title: 'Chamber membership',
    area: LICENCE,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: mainland, with the licence
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: MAINLAND,
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'office-lease-and-ejari',
    title: 'Office lease and Ejari',
    area: LICENCE, // 7: Office and lease sits under licence and cards
    group: 'day0',
    subject: 'office',
    triggerKind: 'onboarding', // 11.1: before the licence; Ejari registered (Dubai mainland)
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { ejariRequired: true }, // 11A premises: Ejari required or not
    mvp: 1, // 18.2 Office and lease: Ejari
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'rent-instalment',
    title: 'Rent instalment',
    area: LICENCE,
    group: 'day0',
    subject: 'instalment',
    triggerKind: 'rentInstalment', // 11.1: each cheque or transfer date in the lease
    defaultLeadDays: SHORT_LEAD, // 11.1: reminded at 7 and 1 days only
    recurrence: 'none',
    appliesWhen: {},
    mvp: 1, // 18.2 Office and lease: instalments
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'utilities-and-telecom',
    title: 'Utilities and telecom accounts',
    area: LICENCE,
    group: 'day0',
    subject: 'office',
    triggerKind: 'onboarding', // 11.1: after the lease
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: {},
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'bank-account',
    title: 'Bank account',
    area: BANKS,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: start immediately; typically weeks
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: {},
    mvp: 1, // 5.6 "already done?" list and 18.2 Banks
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'corporate-tax-registration',
    title: 'Corporate tax registration',
    area: TAX,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: within three months of incorporation
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: {},
    mvp: 1, // 18.2 Corporate tax: registration deadline
    grade: 'confirmed', // 11.1: confirmed
    spec: '11.1',
  }),
  requirement({
    key: 'vat-registration',
    title: 'VAT registration',
    area: TAX,
    group: 'day0',
    subject: 'company',
    triggerKind: 'decision', // 11.1: the portal asks the turnover question
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { vat: 'unknown' }, // 7.1: VAT status not entered shows unknown and asks
    mvp: 1, // 18.2 VAT
    grade: 'confirmed', // 11.1: confirmed
    spec: '11.1',
  }),
  requirement({
    key: 'ubo-declaration',
    title: 'UBO declaration',
    area: LICENCE, // 7: UBO under licence and cards
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: within 60 days of licensing
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: {}, // 11.1: federal rule, same everywhere
    mvp: 1, // 18.2 UBO: filed
    grade: 'confirmed', // 11.1: confirmed (Cabinet Decision 109/2023)
    spec: '11.1',
  }),
  requirement({
    key: 'company-stamp-and-signatory-letters',
    title: 'Company stamp and signatory letters',
    area: LICENCE,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: right after licence
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: {},
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'owner-or-partner-visa',
    title: 'Owner or partner visa',
    area: PEOPLE,
    group: 'day0',
    subject: 'person',
    triggerKind: 'onboarding', // 11.1: after the immigration card; follows the stage chain (6.2)
    defaultLeadDays: SHORT_LEAD, // 9: a lapsing entry permit is a short requirement
    recurrence: 'perPerson',
    appliesWhen: { personType: ['partner'] },
    mvp: 1, // 18.2 Visas and IDs: every person, every stage
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'health-insurance-policy',
    title: 'Health insurance policy',
    area: PEOPLE,
    group: 'day0',
    subject: 'person',
    triggerKind: 'onboarding', // 11.1: before the first residence visa is issued
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: { hasSponsoredPeople: true }, // 7.2: only when the company sponsors someone
    mvp: 1, // 18.2 Health insurance
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'wps-registration',
    title: 'WPS registration',
    area: PEOPLE,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: mainland, before first salary; other zones per file
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { wps: true },
    mvp: 2, // 18.2 carries the pay date only
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'financial-year-end-chosen',
    title: 'Financial year end chosen',
    area: TAX,
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: at setup
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: {},
    mvp: 2, // not in the 18.2 minimum; the company file always carries it
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'aml-registration',
    title: 'AML registration',
    area: LICENCE, // 7: AML under licence and cards
    group: 'day0',
    subject: 'company',
    triggerKind: 'onboarding', // 11.1: only for listed activities
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { amlActivity: true },
    mvp: 2, // 18.3: AML needs the activity list checked
    grade: 'stated',
    spec: '11.1',
  }),
  requirement({
    key: 'sector-permit',
    title: 'Municipality or sector permit',
    area: LICENCE,
    group: 'day0',
    subject: 'activity',
    triggerKind: 'activityChange', // 5.6: a new activity re-runs the permit matching
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { sectorPermit: true },
    mvp: 2, // 11.1: out of Standard unless the activity requires it
    grade: 'stated',
    spec: '11.1',
  }),

  // 11.2 Every year.
  requirement({
    key: 'decision-point',
    title: 'Decision point: renew, cancel or shrink',
    area: LICENCE,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'decision',
    defaultLeadDays: LEAD, // 11.2 and 5.6: 90 days before licence expiry
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 1, // 18.2 Licence: decision point
    grade: 'stated',
    spec: '11.2, 10',
  }),
  requirement({
    key: 'mainland-llc-closing-prompt',
    title: 'Are you thinking of closing?',
    area: LICENCE,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'decision',
    defaultLeadDays: CLOSING_PROMPT_LEAD, // 5.6 and 19: 180 days (11.2's 120 is corrected in 19)
    recurrence: 'yearly',
    appliesWhen: { authorityType: 'mainland', legalForm: ['llc'] },
    mvp: 1, // 18.2 Licence: decision point
    grade: 'stated',
    spec: '5.6, 11.2, 19',
  }),
  requirement({
    key: 'licence-renewal',
    title: 'Licence renewal',
    area: LICENCE,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'licenceExpiry', // 11.2: licence expiry
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 1, // 18.2 Licence
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'immigration-card-renewal',
    title: 'Immigration card renewal',
    area: LICENCE,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'cardExpiry', // 11.2: card expiry, kept in step with the licence
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 1, // 18.2 Establishment cards
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'mohre-card-renewal',
    title: 'MOHRE card renewal',
    area: LICENCE,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'cardExpiry', // 11.2
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: MAINLAND,
    mvp: 1, // 18.2 Establishment cards: MOHRE card for mainland
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'e-signature-card-renewal',
    title: 'E-signature card renewal',
    area: LICENCE,
    group: 'yearly',
    subject: 'document',
    triggerKind: 'cardExpiry', // 11.2: e-signature card yearly per signatory
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'chamber-renewal',
    title: 'Chamber renewal',
    area: LICENCE,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'licenceExpiry', // 11.2: mainland, after the licence renewal
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: MAINLAND,
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'office-lease-renewal',
    title: 'Office lease renewal',
    area: LICENCE,
    group: 'yearly',
    subject: 'office',
    triggerKind: 'leaseEnd', // 11.2: lease end, before licence renewal; per premises
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 1, // 18.2 Office and lease: lease end
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'ejari-renewal',
    title: 'Ejari renewal',
    area: LICENCE,
    group: 'yearly',
    subject: 'office',
    triggerKind: 'leaseEnd', // 11.2: Ejari renewed with the lease
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: { ejariRequired: true },
    mvp: 1, // 18.2 Office and lease: Ejari
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'audited-accounts',
    title: 'Audited accounts',
    area: TAX,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'yearEnd', // 11.2: after year end, before renewal
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: { auditRequired: true }, // 11.2: where required, per file
    mvp: 1, // 18.2 Audited accounts: only where the authority file says required
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'corporate-tax-return',
    title: 'Corporate tax return and payment',
    area: TAX,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'taxPeriodEnd', // 11.2: nine months after the end of the tax period
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 1, // 18.2 Corporate tax: return nine months after year end
    grade: 'confirmed', // 11.2: confirmed
    spec: '11.2',
  }),
  requirement({
    key: 'general-assembly',
    title: 'General assembly',
    area: TAX, // 7: Company records under tax and accounts
    group: 'yearly',
    subject: 'company',
    triggerKind: 'yearEnd', // 11.2: mainland LLC, within four months of year end
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: { authorityType: 'mainland', legalForm: ['llc'], generalAssembly: true },
    mvp: 2, // 18.3: company records and general assembly
    grade: 'reported', // 11.2: verify the article and the free zone equivalents
    spec: '11.2',
  }),
  requirement({
    key: 'send-licence-to-bank',
    title: 'Send renewed licence to the bank',
    area: BANKS,
    group: 'yearly',
    subject: 'bank',
    triggerKind: 'event', // 11.2: after each renewal and after any amendment
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 1, // 18.2 Banks: licence sent after renewal
    grade: 'stated',
    spec: '11.2, 5.6',
  }),
  requirement({
    key: 'bank-kyc-refresh',
    title: 'Bank KYC refresh',
    area: BANKS,
    group: 'yearly',
    subject: 'bank',
    triggerKind: 'kycDate', // 11.2: bank practice, roughly yearly
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 1, // 18.2 Banks: KYC date
    grade: 'reported', // 11.2: bank practice, not law
    spec: '11.2',
  }),
  requirement({
    key: 'health-insurance-renewal',
    title: 'Health insurance renewal',
    area: PEOPLE,
    group: 'yearly',
    subject: 'person',
    triggerKind: 'insuranceEnd', // 11.2: policy end
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: { hasSponsoredPeople: true },
    mvp: 1, // 18.2 Health insurance
    grade: 'stated',
    spec: '11.2',
  }),
  requirement({
    key: 'emiratisation',
    title: 'Emiratisation targets',
    area: PEOPLE,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'yearEnd', // 11.2: per year, half-year split reported
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: { emiratisation: true }, // 11.2: mainland, in scope by headcount and sector
    mvp: 2, // 18.3: needs headcount and sector
    grade: 'reported', // 11.2: the half-year split is reported, not confirmed
    spec: '11.2',
  }),
  requirement({
    key: 'ubo-confirmation',
    title: 'UBO confirmation',
    area: LICENCE,
    group: 'yearly',
    subject: 'company',
    triggerKind: 'licenceExpiry', // 11.2: at renewal, confirm no change
    defaultLeadDays: LEAD,
    recurrence: 'yearly',
    appliesWhen: {},
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.2',
  }),

  // 11.3 Every month or quarter.
  requirement({
    key: 'wages-pay-date',
    title: 'Wages pay date',
    area: PEOPLE,
    group: 'periodic',
    subject: 'company',
    triggerKind: 'payDay', // 11.3: from 1 June 2026 wages are due on the first of the month
    defaultLeadDays: SHORT_LEAD, // 9: a pay date is a short requirement
    recurrence: 'monthly',
    appliesWhen: { wps: true }, // 11.3: mainland and JAFZA confirmed; other zones per file
    mvp: 1, // 18.2 Wages pay date where WPS applies
    grade: 'confirmed', // 11.3: the first of the month is confirmed; thresholds are reported
    spec: '11.3, 6.3',
  }),
  requirement({
    key: 'vat-return',
    title: 'VAT return and payment',
    area: TAX,
    group: 'periodic',
    subject: 'company',
    triggerKind: 'taxPeriodEnd', // 11.3: twenty-eight days after each tax period
    defaultLeadDays: LEAD,
    recurrence: 'quarterly', // 11.3: usually quarterly; the file's period length decides
    appliesWhen: { vat: 'registered' },
    mvp: 1, // 18.2 VAT: return dates when registered
    grade: 'confirmed', // 11.3: confirmed
    spec: '11.3',
  }),
  requirement({
    key: 'turnover-question',
    title: 'Turnover question',
    area: TAX,
    group: 'periodic',
    subject: 'company',
    triggerKind: 'decision', // 11.3: quarterly prompt for unregistered companies
    defaultLeadDays: LEAD,
    recurrence: 'quarterly',
    appliesWhen: { vat: 'not-registered' },
    mvp: 1, // 18.2 VAT: the turnover question when not registered
    grade: 'stated',
    spec: '11.3, 7.2',
  }),
  requirement({
    key: 'end-of-service-accrual',
    title: 'End-of-service accrual',
    area: PEOPLE,
    group: 'periodic',
    subject: 'person',
    triggerKind: 'payDay', // 11.3: monthly, computed, shown per person
    defaultLeadDays: LEAD,
    recurrence: 'monthly',
    appliesWhen: { personType: ['employee'] },
    mvp: 2, // 18.3: needs pay data
    grade: 'stated',
    spec: '11.3',
  }),

  // 11.4 People.
  requirement({
    key: 'visa-stages',
    title: 'Visa stages',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'entryDate', // 11.4: each stage's own validity (6.2)
    defaultLeadDays: SHORT_LEAD, // 9: a lapsing entry permit is a short requirement
    recurrence: 'perPerson',
    appliesWhen: { personType: ['employee'] }, // partners and dependants have their own rows
    mvp: 1, // 18.2 Visas and IDs: every person, every stage
    grade: 'stated',
    spec: '11.4, 6.2',
  }),
  requirement({
    key: 'labour-contract-registered',
    title: 'Labour contract registered',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'entryDate', // 11.4: mainland, within 14 days of entry or status change
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: { authorityType: 'mainland', personType: ['employee'] },
    mvp: 1, // 18.2 Visas and IDs: every stage
    grade: 'reported', // 11.4: reported only
    spec: '11.4',
  }),
  requirement({
    key: 'residency-completed',
    title: 'Residency completed',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'entryDate', // 11.4: within 60 days of entry (Dubai confirmed; SRTIP 55)
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: {},
    mvp: 1, // 18.2 Visas and IDs: every stage
    grade: 'confirmed', // 11.4: Dubai confirmed
    spec: '11.4, 6.2',
  }),
  requirement({
    key: 'unemployment-insurance',
    title: 'Unemployment insurance',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'insuranceEnd', // 11.4: certificate before the labour card; dues block permits
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: { authorityType: 'mainland', personType: ['employee'] }, // 6.1: on the mainland
    mvp: 1, // 6.3: checked before a visa renewal; 6.1: tracked as a blocker
    grade: 'reported', // 11.4: reported
    spec: '11.4, 6.1',
  }),
  requirement({
    key: 'residence-visa-renewal',
    title: 'Residence visa renewal',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'visaExpiry', // 11.4: visa expiry
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: {},
    mvp: 1, // 18.2 Visas and IDs
    grade: 'stated',
    spec: '11.4, 6.3',
  }),
  requirement({
    key: 'emirates-id-renewal',
    title: 'Emirates ID renewal',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'emiratesIdExpiry', // 11.4: tied to the visa
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: {},
    mvp: 1, // 18.2 Visas and IDs
    grade: 'stated',
    spec: '11.4',
  }),
  requirement({
    key: 'work-permit-renewal',
    title: 'Work permit renewal',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'workPermitExpiry', // 11.4: mainland, two years
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: MAINLAND,
    mvp: 1, // 18.2 Visas and IDs
    grade: 'stated',
    spec: '11.4',
  }),
  requirement({
    key: 'passport-expiry',
    title: 'Passport expiry',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'passportExpiry', // 11.4: the employee's own; the notice goes to them
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: {},
    mvp: 1, // 18.2 Visas and IDs: passport validity
    grade: 'stated',
    spec: '11.4, 6.3',
  }),
  requirement({
    key: 'probation-end',
    title: 'Probation end',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'probationEnd', // 11.4: contract date plus probation, six months at most
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: { personType: ['employee'] },
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.4, 6.3',
  }),
  requirement({
    key: 'absence-abroad',
    title: 'Absence abroad',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'lastExit', // 11.4: 180 consecutive days outside the UAE lapses the residence
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: {},
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.4, 6.1',
  }),
  requirement({
    key: 'leaving',
    title: 'Leaving the company',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'event', // 11.4: notice period, settlement, dependants first, cancellation
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: { event: true },
    mvp: 2, // not in the 18.2 minimum
    grade: 'stated',
    spec: '11.4, 6.3',
  }),
  requirement({
    key: 'dependant-sponsorship',
    title: 'Dependant sponsorship',
    area: PEOPLE,
    group: 'people',
    subject: 'person',
    triggerKind: 'entryDate', // 11.4: where the company sponsors dependants
    defaultLeadDays: SHORT_LEAD,
    recurrence: 'perPerson',
    appliesWhen: { personType: ['dependant'], hasSponsoredPeople: true }, // 11.4: where the company sponsors
    mvp: 1, // 18.2 Visas and IDs: every person; 19: employee-sponsored dependants are MVP 2
    grade: 'stated',
    spec: '11.4',
  }),

  // 11.5 Changes.
  requirement({
    key: 'ownership-change',
    title: 'Ownership change',
    area: LICENCE,
    group: 'change',
    subject: 'company',
    triggerKind: 'ownershipChange', // 11.5: amend licence, update UBO within the day limit
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { ownershipChanged: true },
    mvp: 1, // 18.2 UBO: updated after ownership changes
    grade: 'confirmed', // 11.1: UBO changes within 15 days, confirmed
    spec: '11.5, 11.1',
  }),
  requirement({
    key: 'manager-or-signatory-change',
    title: 'Manager or signatory change',
    area: LICENCE,
    group: 'change',
    subject: 'company',
    triggerKind: 'event', // 11.5: amend licence, new signatory letters, bank, cards
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { event: true },
    mvp: 1, // 17: amendments are in MVP 1
    grade: 'stated',
    spec: '11.5',
  }),
  requirement({
    key: 'activity-change',
    title: 'Activity change',
    area: LICENCE,
    group: 'change',
    subject: 'company',
    triggerKind: 'activityChange', // 11.5: amend licence; check AML and permit consequences
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { activityChanged: true },
    mvp: 1, // 17: amendments are in MVP 1
    grade: 'stated',
    spec: '11.5',
  }),
  requirement({
    key: 'office-move',
    title: 'Office move or extra premises',
    area: LICENCE,
    group: 'change',
    subject: 'company',
    triggerKind: 'event', // 11.5: new lease and Ejari, amend the licence, update every record
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { event: true },
    mvp: 1, // 17: amendments are in MVP 1
    grade: 'stated',
    spec: '11.5',
  }),
  requirement({
    key: 'quota-increase',
    title: 'Quota increase',
    area: LICENCE,
    group: 'change',
    subject: 'company',
    triggerKind: 'event', // 11.5: zone or MOHRE approval, often tied to office size
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { event: true },
    mvp: 1, // 17: amendments are in MVP 1
    grade: 'reported', // 11.5: ratio per authority
    spec: '11.5',
  }),

  // 11.6 Exit. Every row opens when the decision point is answered "cancel" (spec 10).
  requirement({
    key: 'resolution-and-liquidator',
    title: 'Resolution, and liquidator where the legal form needs one',
    area: LICENCE,
    group: 'exit',
    subject: 'company',
    triggerKind: 'decision', // 11.6: mainland LLC needs a liquidator and a creditor notice
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { decision: 'cancel' },
    mvp: 1, // 17: the cancellation tracker is in MVP 1
    grade: 'reported', // 11.6: confirmed law; durations reported
    spec: '11.6, 5.6',
  }),
  requirement({
    key: 'cancel-employee-visas',
    title: 'Cancel employee visas',
    area: PEOPLE,
    group: 'exit',
    subject: 'person',
    triggerKind: 'decision', // 11.6: before company cancellation; settle end of service
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: { decision: 'cancel', personType: ['employee'] },
    mvp: 1,
    grade: 'stated',
    spec: '11.6',
  }),
  requirement({
    key: 'cancel-partner-visas-and-cards',
    title: 'Cancel partner visas and cards',
    area: PEOPLE,
    group: 'exit',
    subject: 'person',
    triggerKind: 'decision', // 11.6: after employees
    defaultLeadDays: LEAD,
    recurrence: 'perPerson',
    appliesWhen: { decision: 'cancel', personType: ['partner'] },
    mvp: 1,
    grade: 'stated',
    spec: '11.6',
  }),
  requirement({
    key: 'vat-deregistration',
    title: 'VAT deregistration',
    area: TAX,
    group: 'exit',
    subject: 'company',
    triggerKind: 'decision', // 11.6: within 20 business days of no longer being required
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { decision: 'cancel', vat: 'registered' },
    mvp: 1,
    grade: 'reported', // 11.6 and 19: reported
    spec: '11.6',
  }),
  requirement({
    key: 'corporate-tax-deregistration',
    title: 'Corporate tax deregistration and final return',
    area: TAX,
    group: 'exit',
    subject: 'company',
    triggerKind: 'decision', // 11.6: within three months of cessation
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { decision: 'cancel', corporateTaxRegistered: true },
    mvp: 1,
    grade: 'reported', // 11.6 and 19: reported
    spec: '11.6',
  }),
  requirement({
    key: 'clearances',
    title: 'Clearances',
    area: LICENCE,
    group: 'exit',
    subject: 'company',
    triggerKind: 'decision', // 11.6: utilities, telecom, zone, immigration, labour
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { decision: 'cancel' },
    mvp: 1,
    grade: 'stated',
    spec: '11.6',
  }),
  requirement({
    key: 'hand-back-office',
    title: 'Hand back the office',
    area: LICENCE,
    group: 'exit',
    subject: 'office',
    triggerKind: 'decision', // 11.6: utilities cleared, deposit returned, lease and Ejari cancelled
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { decision: 'cancel' },
    mvp: 1,
    grade: 'stated',
    spec: '11.6',
  }),
  requirement({
    key: 'close-bank-account',
    title: 'Close bank account',
    area: BANKS,
    group: 'exit',
    subject: 'bank',
    triggerKind: 'decision', // 11.6: after final settlements
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { decision: 'cancel' },
    mvp: 1,
    grade: 'stated',
    spec: '11.6',
  }),
  requirement({
    key: 'cancellation-certificate',
    title: 'Cancellation certificate',
    area: LICENCE,
    group: 'exit',
    subject: 'company',
    triggerKind: 'decision', // 11.6: from the authority; the company becomes "closed"
    defaultLeadDays: LEAD,
    recurrence: 'none',
    appliesWhen: { decision: 'cancel' },
    mvp: 1,
    grade: 'stated',
    spec: '11.6, 5.6',
  }),
];

const byKey = new Map<string, Requirement>(REQUIREMENTS.map((entry) => [entry.key, entry]));

export function requirementByKey(key: RequirementKey): Requirement {
  const found = byKey.get(key);
  if (found === undefined) {
    throw new Error(`no requirement ${key}`);
  }
  return found;
}

export function findRequirement(id: string): Requirement | null {
  return byKey.get(id) ?? null;
}
