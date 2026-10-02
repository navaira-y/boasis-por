import { z } from 'zod';
import { AuthorityId, Id, IsoDate, MonthDay } from './common';
import { LegalForm } from './legal-form';
import {
  CompanyCardRecords,
  CompanyProfile,
  CorporateTaxRecord,
  PremisesRecord,
  VatRecord,
  VisaQuotaRecord,
} from './company-profile';

// The licence version an activity came from (spec 5.1): the issue date printed on that licence
// or amended licence, and the vault document holding it. A null documentId means that paper is
// not in the vault.
export const LicenceVersion = z.object({
  issuedOn: IsoDate,
  documentId: Id.nullable(),
});
export type LicenceVersion = z.infer<typeof LicenceVersion>;

// One activity on the licence, tracked as a list entry, not free text (spec 5.1).
export const Activity = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  addedOn: IsoDate,
  removedOn: IsoDate.nullable(),
  // Optional so an activity written before the field existed still parses; null is not entered.
  licenceVersion: LicenceVersion.nullable().optional(),
});
export type Activity = z.infer<typeof Activity>;

// The legal form lives in its own file so the onboarding records can name it too.
export { LegalForm } from './legal-form';

// Mainland MOHRE company classification (spec 5.1): category 1, 2A to 2D, or 3.
export const MohreClassification = z.enum(['1', '2A', '2B', '2C', '2D', '3']);
export type MohreClassification = z.infer<typeof MohreClassification>;

// A period with a start and an end, both calendar dates.
export const DatePeriod = z.object({
  start: IsoDate,
  end: IsoDate,
});
export type DatePeriod = z.infer<typeof DatePeriod>;

export const CompanyIdentity = z.object({
  tradeName: z.string().min(1),
  legalForm: LegalForm,
  authority: AuthorityId,
  licenceNumber: z.string().min(1),
  issueDate: IsoDate,
  expiryDate: IsoDate,
  activities: z.array(Activity),
  incorporationDate: IsoDate,
  financialYearEnd: MonthDay,
  // The rest of spec 5.1 Identity. Optional so a record written before these fields existed still
  // parses; null means not entered.
  licenceCategory: z.string().min(1).nullable().optional(),
  // The registered address is one of the company's offices (spec 5.1 Offices).
  registeredOfficeId: Id.nullable().optional(),
  firstTaxPeriod: DatePeriod.nullable().optional(),
  // Mainland only; null on a free zone company or when not entered.
  mohreClassification: MohreClassification.nullable().optional(),
});
export type CompanyIdentity = z.infer<typeof CompanyIdentity>;

export const CardRecord = z.object({
  number: z.string().min(1),
  expiry: IsoDate,
});
export type CardRecord = z.infer<typeof CardRecord>;

// A card held by one named person: an e-signature card or a GDRFA PRO card (spec 5.1). Null on
// a field means not entered.
export const HeldCard = z.object({
  holder: z.string().min(1),
  number: z.string().min(1).nullable(),
  expiry: IsoDate.nullable(),
});
export type HeldCard = z.infer<typeof HeldCard>;

// The e-channel or zone portal registration (spec 5.1).
export const PortalRegistration = z.object({
  portalName: z.string().min(1),
  reference: z.string().min(1).nullable(),
  registeredOn: IsoDate.nullable(),
});
export type PortalRegistration = z.infer<typeof PortalRegistration>;

export const ChamberMembership = z.object({
  number: z.string().min(1).nullable(),
  expiry: IsoDate.nullable(),
});
export type ChamberMembership = z.infer<typeof ChamberMembership>;

// A municipality or sector permit (spec 5.1).
export const CompanyPermit = z.object({
  name: z.string().min(1),
  number: z.string().min(1).nullable(),
  expiry: IsoDate.nullable(),
});
export type CompanyPermit = z.infer<typeof CompanyPermit>;

export const CompanyCards = z.object({
  immigrationCard: CardRecord.nullable(),
  mohreCard: CardRecord.nullable(),
  // The rest of spec 5.1 Cards and registrations. Optional so a record written before these
  // fields existed still parses. Null means not entered; an empty list means there are none.
  eSignatureCards: z.array(HeldCard).nullable().optional(),
  proCard: HeldCard.nullable().optional(),
  portalRegistration: PortalRegistration.nullable().optional(),
  chamberMembership: ChamberMembership.nullable().optional(),
  permits: z.array(CompanyPermit).nullable().optional(),
});
export type CompanyCards = z.infer<typeof CompanyCards>;

// A yes, no or unknown fact, so an unanswered value is visible as not entered.
export const YesNoUnknown = z.enum(['yes', 'no', 'unknown']);
export type YesNoUnknown = z.infer<typeof YesNoUnknown>;

// Spec 5.1 Ownership and control. The UBO filing date is CompanyUbo.declaredOn, not repeated
// here. Null on a field means not entered.
export const Shareholder = z.object({
  name: z.string().min(1),
  nationality: z.string().min(1).nullable(),
  percentage: z.number().min(0).max(100).nullable(),
});
export type Shareholder = z.infer<typeof Shareholder>;

export const BeneficialOwner = z.object({
  name: z.string().min(1),
  percentage: z.number().min(0).max(100).nullable(),
});
export type BeneficialOwner = z.infer<typeof BeneficialOwner>;

export const CompanyOwnership = z.object({
  shareholders: z.array(Shareholder).nullable(),
  ubos: z.array(BeneficialOwner).nullable(),
  manager: z.string().min(1).nullable(),
  signatories: z.array(z.string().min(1)).nullable(),
  memorandumDate: IsoDate.nullable(),
});
export type CompanyOwnership = z.infer<typeof CompanyOwnership>;

export const Auditor = z.object({
  name: z.string().min(1),
  email: z.string().nullable(),
});
export type Auditor = z.infer<typeof Auditor>;

// A PRO or accountant the company uses who is not a member (spec 5.1 Outside people).
// Responsibility is set on the access page only, never here.
export const OutsideContact = z.object({
  name: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type OutsideContact = z.infer<typeof OutsideContact>;

export const OutsidePeople = z.object({
  pro: OutsideContact.nullable(),
  accountant: OutsideContact.nullable(),
});
export type OutsidePeople = z.infer<typeof OutsidePeople>;

// Active, or closed with the day it closed (spec 5.6 Cancellation: the company stays in the
// account as closed with its records).
export const CompanyStatus = z.discriminatedUnion('state', [
  z.object({ state: z.literal('active') }),
  z.object({ state: z.literal('closed'), closedOn: IsoDate }),
]);
export type CompanyStatus = z.infer<typeof CompanyStatus>;

export const CorporateTax = z.object({
  registered: z.boolean(),
  registrationNumber: z.string().nullable(),
  registeredOn: IsoDate.nullable(),
});
export type CorporateTax = z.infer<typeof CorporateTax>;

export const VatStatus = z.enum(['not-registered', 'registered', 'unknown']);
export type VatStatus = z.infer<typeof VatStatus>;

export const Vat = z.object({
  status: VatStatus,
  trn: z.string().nullable(),
  // The end of any one VAT tax period and the period length in months (spec 11.3: the return is
  // due twenty-eight days after each tax period, usually quarterly). Absent or null means not
  // entered yet; the VAT return card then shows "unknown" and asks.
  periodEnd: IsoDate.nullable().optional(),
  periodMonths: z.number().int().positive().nullable().optional(),
});
export type Vat = z.infer<typeof Vat>;

export const CompanyTax = z.object({
  corporateTax: CorporateTax,
  vat: Vat,
  // The rest of spec 5.1 Tax. Optional so a record written before these fields existed still
  // parses; absent reads as unknown and not entered.
  smallBusinessRelief: YesNoUnknown.optional(),
  auditRequired: YesNoUnknown.optional(),
  auditor: Auditor.nullable().optional(),
  // Onboarding v2 section F: the tax answers as entered, each with its state and origin. Optional
  // so a record written before onboarding v2 still parses; absent means the step was not reached.
  corporateTaxRecord: CorporateTaxRecord.nullable().optional(),
  vatRecord: VatRecord.nullable().optional(),
});
export type CompanyTax = z.infer<typeof CompanyTax>;

export const VisaCapacity = z.object({
  allowed: z.number().int().nonnegative(),
  used: z.number().int().nonnegative(),
});
export type VisaCapacity = z.infer<typeof VisaCapacity>;

// One bank account (spec 7.2 Banks, 18.2): the KYC refresh date the bank set, and the issue date
// of the last licence sent to this bank. Null means not known or never sent.
export const BankAccount = z.object({
  id: Id,
  bankName: z.string().min(1),
  kycRefreshOn: IsoDate.nullable(),
  licenceSentOn: IsoDate.nullable(),
  // The rest of spec 5.1 Banks. Optional so a record written before these fields existed still
  // parses. Null means not entered; amendmentSentOn is also null when no amendment was sent.
  openedOn: IsoDate.nullable().optional(),
  signatories: z.array(z.string().min(1)).nullable().optional(),
  amendmentSentOn: IsoDate.nullable().optional(),
});
export type BankAccount = z.infer<typeof BankAccount>;

// The UBO facts (spec 11.1 UBO declaration, 11.5 ownership change): when the declaration was
// filed and when ownership last changed. Null means not filed or no change recorded.
export const CompanyUbo = z.object({
  declaredOn: IsoDate.nullable(),
  lastOwnershipChangeOn: IsoDate.nullable(),
});
export type CompanyUbo = z.infer<typeof CompanyUbo>;

export const DecisionAnswer = z.enum(['renew', 'cancel', 'shrink']);
export type DecisionAnswer = z.infer<typeof DecisionAnswer>;

// The decision point answer (spec 10) for one licence cycle. forExpiry names the licence expiry
// the answer belongs to; thinkingOfClosing is the mainland LLC 180-day prompt (spec 5.6).
export const CompanyDecision = z.object({
  forExpiry: IsoDate,
  answer: DecisionAnswer.nullable(),
  thinkingOfClosing: z.boolean().nullable(),
});
export type CompanyDecision = z.infer<typeof CompanyDecision>;

// The facts a rule may need that no document shows and the authority file may lack (build plan
// 3A, spec 5.6 "already done?", spec 18.1 "unknown asks for it"). The onboarding screen asks
// them; packages/rules says which are still unknown. A closed list, so a screen and a rule
// cannot drift apart on a question's name.
export const QuestionId = z.enum([
  'auditRequiredForRenewal',
  'cancellationWindowDays',
  'cancellationFeeInsideAed',
  'cancellationFeeOutsideAed',
  'renewalBundle',
  'wpsApplies',
  'ejariRequired',
  'generalAssemblyRequired',
  'leaseMinimumRemainingDays',
]);
export type QuestionId = z.infer<typeof QuestionId>;

export const AnswerValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type AnswerValue = z.infer<typeof AnswerValue>;

// One answer the owner gave to one question. Third in precedence, after the company's
// documents and the authority file (build plan 3A); the rules take the latest per question.
export const Answer = z.object({
  questionId: QuestionId,
  answer: AnswerValue,
  answeredOn: IsoDate,
  source: z.literal('owner-answer'),
});
export type Answer = z.infer<typeof Answer>;

// The one shape a company is described by. Onboarding fills it from the licence upload; the
// Brain will fill it from the setup journey. Every rule reads from it.
// How the owner shows the company on their own screens (managed companies): its colour and a
// logo kept as a data URL. The colour is a key into the one company palette, never a free hex,
// so no one can pick a colour an orbit or a state already uses (the CEO instruction on company
// colours: chosen at registration, editable in managed companies). The palette holds seven
// colours, keys 0 to 6; the portal test that enforces its hue rule allows no more. Null means
// not chosen yet: the portal falls back to a colour picked from the id. The logo is not drawn on
// the dial.
export const CompanyBrand = z.object({
  colourSlot: z.number().int().min(0).max(6).nullable(),
  logoDataUrl: z.string().nullable(),
});
export type CompanyBrand = z.infer<typeof CompanyBrand>;

export const CompanyFacts = z.object({
  id: Id,
  identity: CompanyIdentity,
  cards: CompanyCards,
  tax: CompanyTax,
  visaCapacity: VisaCapacity,
  // Optional so a record written before these fields existed still parses. Absent or null means
  // the person has not answered yet, which the rules read as unknown, never as done.
  banks: z.array(BankAccount).nullable().optional(),
  ubo: CompanyUbo.nullable().optional(),
  decision: CompanyDecision.nullable().optional(),
  answers: z.array(Answer).nullable().optional(),
  brand: CompanyBrand.nullable().optional(),
  ownership: CompanyOwnership.nullable().optional(),
  outsidePeople: OutsidePeople.nullable().optional(),
  // Absent reads as active.
  status: CompanyStatus.nullable().optional(),
  // Onboarding v2 section F, as entered with state and origin. Optional so a record written before
  // onboarding v2 still parses; absent means the step was not reached. profile.incorporationDate
  // is the onboarding answer; when it is known the writer keeps identity.incorporationDate equal.
  profile: CompanyProfile.nullable().optional(),
  premises: PremisesRecord.nullable().optional(),
  companyCards: CompanyCardRecords.nullable().optional(),
  // Onboarding v2 step 5, as entered. visaCapacity keeps the plain numbers the older screens read.
  visaQuota: VisaQuotaRecord.nullable().optional(),
});
export type CompanyFacts = z.infer<typeof CompanyFacts>;
