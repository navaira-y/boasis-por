import { z } from 'zod';
import { IsoDate, MonthDay } from './common';
import { LegalForm } from './legal-form';
import { field, YesNo } from './field';

// Onboarding v2 section C step 2 and F: the licence facts the onboarding asks that the company
// identity does not hold. Jurisdiction is not here: it is derived from the authority file.
export const LicenceStatus = z.enum([
  'active',
  'expired',
  'renewal-in-progress',
  'being-cancelled',
]);
export type LicenceStatus = z.infer<typeof LicenceStatus>;

// Who handles the zone paperwork. Not sure is the unknown state of the field.
export const Handler = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('self') }),
  z.object({
    kind: z.literal('agent'),
    name: z.string().min(1).nullable(),
    email: z.string().email().nullable(),
  }),
  z.object({ kind: z.literal('zone') }),
]);
export type Handler = z.infer<typeof Handler>;

export const CompanyProfile = z.object({
  licenceStatus: field(LicenceStatus),
  // Some zones issue multi-year licences; the screen defaults to 1.
  licenceTermYears: field(z.number().int().positive()),
  // From the certificate of incorporation or registration, not the licence.
  incorporationDate: field(IsoDate),
  website: field(z.string().min(1)),
  handler: field(Handler),
  // Onboarding v2 step 2, added after the first cut, so a profile written before them still
  // parses; absent reads as not asked. The licence dates as entered: a skip or a "not sure" is kept
  // here, and the identity dates are then not the person's answer.
  licenceIssueDate: field(IsoDate).optional(),
  licenceExpiryDate: field(IsoDate).optional(),
  // Asked only while a renewal is in progress; null on any other status.
  expectedNewExpiry: field(IsoDate).nullable().optional(),
  // A free text list for now; some activities need approvals later.
  activities: field(z.array(z.string().min(1))).optional(),
  // "Not sure" on the legal form is the unknown state here; the identity then holds "unknown".
  legalForm: field(LegalForm).optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfile>;

// Onboarding v2 section C step 4. Not sure is the unknown state of the type field.
export const OfficeKind = z.enum(['flexi-desk', 'office', 'warehouse-or-land', 'none']);
export type OfficeKind = z.infer<typeof OfficeKind>;

export const PremisesRecord = z.object({
  type: field(OfficeKind),
  // The contract or lease end date.
  endDate: field(IsoDate),
  renewsWithLicence: field(YesNo),
});
export type PremisesRecord = z.infer<typeof PremisesRecord>;

// Onboarding v2 section C step 5 and G: one entry per card, keyed by kind. Free zones use the
// establishment (immigration) card; mainland adds the MOHRE card and Chamber membership as kinds,
// not as new fields.
export const CompanyCardKind = z.enum(['establishment', 'mohre', 'chamber']);
export type CompanyCardKind = z.infer<typeof CompanyCardKind>;

export const CompanyCardRecord = z.object({
  kind: CompanyCardKind,
  expiry: field(IsoDate),
});
export type CompanyCardRecord = z.infer<typeof CompanyCardRecord>;

export const CompanyCardRecords = z
  .array(CompanyCardRecord)
  .refine((cards) => new Set(cards.map((card) => card.kind)).size === cards.length, {
    message: 'one entry per card kind',
  });
export type CompanyCardRecords = z.infer<typeof CompanyCardRecords>;

// Onboarding v2 section C step 6. A null field was not asked on the branch the person took;
// registered is always asked.
export const CorporateTaxRecord = z.object({
  registered: field(YesNo),
  trn: field(z.string().min(1)).nullable(),
  // From the registration certificate: a first period can run 6 to 18 months.
  firstTaxPeriodEnd: field(IsoDate).nullable(),
  financialYearEnd: field(MonthDay).nullable(),
  // Whether the company intends to claim Qualifying Free Zone Person status.
  qfzpIntent: field(YesNo).nullable(),
});
export type CorporateTaxRecord = z.infer<typeof CorporateTaxRecord>;

// Onboarding v2 section C step 7.
export const VatFilingPeriod = z.enum(['quarterly', 'monthly']);
export type VatFilingPeriod = z.infer<typeof VatFilingPeriod>;

// Taxable supplies and imports over the last 12 months, as a band. Not sure is the unknown state.
export const VatTurnoverBand = z.enum(['below-187500', '187500-375000', 'above-375000']);
export type VatTurnoverBand = z.infer<typeof VatTurnoverBand>;

export const VatRecord = z.object({
  registered: field(YesNo),
  // Registered branch.
  trn: field(z.string().min(1)).nullable(),
  filingPeriod: field(VatFilingPeriod).nullable(),
  // The end date of the current or last tax period, from the VAT certificate.
  periodEnd: field(IsoDate).nullable(),
  // Not registered branch. The second answer asks whether supplies will pass the mandatory
  // threshold (content/federal.json) within the next 30 days.
  last12MonthsBand: field(VatTurnoverBand).nullable(),
  expectsToPassMandatoryInNext30Days: field(YesNo).nullable(),
});
export type VatRecord = z.infer<typeof VatRecord>;

// Onboarding v2 step 5: how many visas the company may sponsor and how many it uses, as entered.
// Visas left is computed, never stored.
export const VisaQuotaRecord = z.object({
  allowed: field(z.number().int().nonnegative()),
  used: field(z.number().int().nonnegative()),
});
export type VisaQuotaRecord = z.infer<typeof VisaQuotaRecord>;
