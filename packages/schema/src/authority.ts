import { z } from 'zod';
import { AuthorityId, RequirementId, Emirate, IsoDate } from './common';

// Every leaf value in an authority file carries its source, when it was last checked, and a
// grade. Nothing in the file is a bare value (spec 11A).
export const FactGrade = z.enum(['confirmed', 'reported', 'unclear']);
export type FactGrade = z.infer<typeof FactGrade>;

// A fact may be unknown: value null, and then the grade must be "unclear" and the source says
// where it was looked for (for example "not in research"). A known value carries any grade.
export function fact<T extends z.ZodTypeAny>(value: T) {
  return z
    .object({
      value: value.nullable(),
      source: z.string().min(1),
      lastChecked: IsoDate,
      grade: FactGrade,
    })
    .refine((f) => f.value !== null || f.grade === 'unclear', {
      message: 'an unknown fact (value null) must carry grade "unclear"',
    });
}
export interface Fact<T> {
  value: T | null;
  source: string;
  lastChecked: IsoDate;
  grade: FactGrade;
}

export const AuthorityIdentity = z.object({
  name: fact(z.string().min(1)),
  emirate: fact(z.string().min(1)),
  type: fact(z.enum(['mainland', 'free-zone'])),
  visaSponsor: fact(z.enum(['mohre', 'zone'])),
  submissionChannel: fact(z.string()),
  portalAddress: fact(z.string()),
});
export type AuthorityIdentity = z.infer<typeof AuthorityIdentity>;

export const FeeLine = z.object({ name: z.string().min(1), amountAed: z.number().nonnegative() });
export type FeeLine = z.infer<typeof FeeLine>;

export const AuthorityLicence = z.object({
  validityMonths: fact(z.number().int().positive()).optional(),
  renewalLeadDays: fact(z.number().int().nonnegative()).optional(),
  renewalChecklist: fact(z.array(z.string())).optional(),
  prerequisites: z
    .object({
      leaseMinimumRemainingDays: fact(z.number().int().nonnegative()).optional(),
      auditRequired: fact(z.boolean()).optional(),
      finesCleared: fact(z.boolean()).optional(),
    })
    .optional(),
  fees: fact(z.array(FeeLine)).optional(),
  lateRenewalFine: fact(z.string()).optional(),
  cancellationWindowDays: fact(z.number().int().nonnegative()).optional(),
  cancellationFeesInsideWindow: fact(z.array(FeeLine)).optional(),
  cancellationFeesOutsideWindow: fact(z.array(FeeLine)).optional(),
  amendmentTypes: fact(
    z.array(z.object({ type: z.string(), feeAed: z.number().nullable() })),
  ).optional(),
});
export type AuthorityLicence = z.infer<typeof AuthorityLicence>;

export const AuthorityCard = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  validityMonths: fact(z.number().int().positive()),
  lateFine: fact(z.string()).optional(),
});
export type AuthorityCard = z.infer<typeof AuthorityCard>;

export const AuthorityPremises = z.object({
  packageTypes: fact(z.array(z.string())).optional(),
  termFollowsLicence: fact(z.boolean()).optional(),
  visaQuotaRule: fact(z.string()).optional(),
  ejariRequired: fact(z.boolean()).optional(),
  // Onboarding v2 step 5: the visas a flexi desk carries, where the research confirms a number.
  // It prefills the quota; the person can change it.
  flexiDeskVisaQuota: fact(z.number().int().nonnegative()).optional(),
});
export type AuthorityPremises = z.infer<typeof AuthorityPremises>;

export const AuthorityPeople = z.object({
  passportValidityNewMonths: fact(z.number().int().nonnegative()).optional(),
  passportValidityRenewalMonths: fact(z.number().int().nonnegative()).optional(),
  permitValidityMonths: fact(z.number().int().nonnegative()).optional(),
  entryToResidencyDays: fact(z.number().int().nonnegative()).optional(),
  renewalWindowDays: fact(z.number().int().nonnegative()).optional(),
  medicalRequirement: fact(z.string()).optional(),
  insuranceRule: fact(z.string()).optional(),
  unemploymentInsuranceRule: fact(z.string()).optional(),
  wagesRule: fact(z.string()).optional(),
  // Whether the Wage Protection System applies under this authority (spec 6.1 Pay, 11.1 WPS
  // registration, 11.3 Wages). wagesRule above carries the text; this flag drives the rules.
  wpsApplies: fact(z.boolean()).optional(),
  emiratisationInScope: fact(z.boolean()).optional(),
  // Onboarding v2 step 5 and section I: whether a valid establishment card is needed to issue or
  // renew visas. Per zone; absent reads as unknown ("check with your zone").
  establishmentCardNeededForVisas: fact(z.boolean()).optional(),
});
export type AuthorityPeople = z.infer<typeof AuthorityPeople>;

export const AuthorityCompanyRequirements = z.object({
  auditRequiredForRenewal: fact(z.boolean()).optional(),
  generalAssemblyRule: fact(z.string()).optional(),
  uboRoute: fact(z.string()).optional(),
  amlActivities: fact(z.array(z.string())).optional(),
  sectorPermits: fact(
    z.array(z.object({ activityCode: z.string(), permit: z.string() })),
  ).optional(),
});
export type AuthorityCompanyRequirements = z.infer<typeof AuthorityCompanyRequirements>;

export const Playbook = z.object({
  requirementId: RequirementId,
  steps: fact(z.array(z.string().min(1))),
});
export type Playbook = z.infer<typeof Playbook>;

export const LibraryRef = z.object({
  requirementId: RequirementId,
  entryPath: z.string().min(1),
});
export type LibraryRef = z.infer<typeof LibraryRef>;

// One file per authority, data not code (spec 11A). The identity block is required; every other
// part may be empty until the Content role fills it from the research files.
export const AuthorityFile = z.object({
  id: AuthorityId,
  version: z.string().min(1),
  identity: AuthorityIdentity,
  licence: AuthorityLicence,
  cards: z.array(AuthorityCard),
  premises: AuthorityPremises,
  people: AuthorityPeople,
  companyRequirements: AuthorityCompanyRequirements,
  playbooks: z.array(Playbook),
  library: z.array(LibraryRef),
  // Facts the research added that the file shape does not name yet, keyed by a dotted path such
  // as "licence.afterExpiry". Each is a fact with its source and grade; packages/rules reads the
  // ones it knows through ZoneRenewalFacts below and ignores the rest.
  proposedFields: z.record(z.string(), fact(z.unknown())).optional(),
});
export type AuthorityFile = z.infer<typeof AuthorityFile>;

// Onboarding v2 step 2 and Appendix A: the free zone licence renewal facts, one value shape per
// proposed field. A fact that is missing or does not match its shape reads as unknown.
export const ZoneRenewalFacts = z.object({
  'licence.leaseMustBeValidToRenew': fact(z.boolean()),
  'licence.leaseMinRemainingDays': fact(z.number().int().nonnegative()),
  'licence.renewalWindow': fact(z.string().min(1)),
  'licence.renewsTogether': fact(z.string().min(1)),
  'licence.afterExpiry': fact(z.string().min(1)),
  'licence.graceDays': fact(z.number().int().nonnegative()),
});
export type ZoneRenewalFacts = z.infer<typeof ZoneRenewalFacts>;
export type ZoneRenewalFactKey = keyof ZoneRenewalFacts;

// One row of content/authorities/index.json: the identity of one licensing authority. Every
// authority in the UAE has a row; `file` names the deep file when the Content role has filled one
// and is null otherwise. A deep file is enrichment, never a condition for onboarding.
export const AuthorityIndexEntry = z.object({
  id: AuthorityId,
  name: fact(z.string().min(1)),
  emirate: fact(Emirate),
  type: fact(z.enum(['mainland', 'free-zone'])),
  visaSponsor: fact(z.enum(['mohre', 'zone'])),
  // The names people write, for example "DED", "DET", "Dubai Economy". Matched case-insensitively.
  aliases: z.array(z.string().min(1)),
  file: z.string().min(1).nullable(),
  source: z.string().min(1),
  lastChecked: IsoDate,
});
export type AuthorityIndexEntry = z.infer<typeof AuthorityIndexEntry>;

export const AuthorityIndex = z.object({
  version: z.string().min(1),
  authorities: z.array(AuthorityIndexEntry),
});
export type AuthorityIndex = z.infer<typeof AuthorityIndex>;
