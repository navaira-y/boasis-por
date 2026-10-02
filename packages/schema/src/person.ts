import { z } from 'zod';
import { Id, IsoDate } from './common';

// The ten stages of the visa process, in order (spec 6.2).
export const Stage = z.enum([
  'quota-check',
  'offer-letter',
  'entry-permit',
  'entry',
  'health-insurance',
  'medical',
  'emirates-id',
  'residence-visa',
  'labour-contract',
  'work-permit',
]);
export type Stage = z.infer<typeof Stage>;

export const PersonType = z.enum(['employee', 'partner', 'dependant']);
export type PersonType = z.infer<typeof PersonType>;

export const Sponsor = z.object({
  kind: z.enum(['company', 'employee', 'family']),
  personId: Id.nullable(),
});
export type Sponsor = z.infer<typeof Sponsor>;

export const Contact = z.object({
  email: z.string().nullable(),
  phone: z.string().nullable(),
});
export type Contact = z.infer<typeof Contact>;

export const PersonIdentity = z.object({
  name: z.string().min(1),
  nationality: z.string(),
  passportNumber: z.string().min(1),
  passportIssue: IsoDate.nullable(),
  passportExpiry: IsoDate.nullable(),
  dateOfBirth: IsoDate.nullable(),
  role: z.string(),
  startDate: IsoDate.nullable(),
  emirateOfWork: z.string(),
  language: z.string(),
  noticeConsent: z.boolean(),
});
export type PersonIdentity = z.infer<typeof PersonIdentity>;

export const PersonStatus = z.object({
  type: PersonType,
  sponsor: Sponsor,
  mohrePermitType: z.string().nullable(),
  stage: Stage,
  entryPermitIssuedOn: IsoDate.nullable(),
  entryDate: IsoDate.nullable(),
  visaNumber: z.string().nullable(),
  unifiedNumber: z.string().nullable(),
  visaExpiry: IsoDate.nullable(),
  emiratesIdNumber: z.string().nullable(),
  emiratesIdExpiry: IsoDate.nullable(),
  workPermitExpiry: IsoDate.nullable(),
  contractType: z.string().nullable(),
  noticePeriodDays: z.number().int().nonnegative().nullable(),
  contractStart: IsoDate.nullable(),
  contractEnd: IsoDate.nullable(),
  probationEnd: IsoDate.nullable(),
  leaveBalanceDays: z.number().nullable(),
  lastExitDate: IsoDate.nullable(),
});
export type PersonStatus = z.infer<typeof PersonStatus>;

export const HealthInsurance = z.object({
  policyNumber: z.string(),
  endDate: IsoDate,
  paidBy: z.enum(['employer', 'sponsor']),
});
export type HealthInsurance = z.infer<typeof HealthInsurance>;

export const UnemploymentInsurance = z.object({
  certificateNumber: z.string().nullable(),
  validUntil: IsoDate.nullable(),
  duesOutstanding: z.boolean().nullable(),
});
export type UnemploymentInsurance = z.infer<typeof UnemploymentInsurance>;

export const PersonCover = z.object({
  healthInsurance: HealthInsurance.nullable(),
  unemploymentInsurance: UnemploymentInsurance.nullable(),
});
export type PersonCover = z.infer<typeof PersonCover>;

export const PersonPay = z.object({
  basicSalaryAed: z.number().nonnegative().nullable(),
  totalSalaryAed: z.number().nonnegative().nullable(),
  payDay: z.number().int().min(1).max(31).nullable(),
  underWps: z.boolean().nullable(),
  endOfServiceAccruedAed: z.number().nonnegative().nullable(),
});
export type PersonPay = z.infer<typeof PersonPay>;

export const Person = z.object({
  id: Id,
  companyId: Id,
  identity: PersonIdentity,
  status: PersonStatus,
  cover: PersonCover,
  pay: PersonPay,
  contact: Contact,
  notify: z.boolean(),
  // The access grant this person is assigned to (spec 4.1: assignment is finer than
  // responsibility, so a PRO sees the people assigned to them). Optional so an older record
  // still parses; null means nobody is assigned.
  assigneeId: Id.nullable().optional(),
  // The human on the account this record belongs to (account-person.ts), so an owner or manager
  // who is also on this company's visa keeps one set of personal dates. Optional so an older
  // record still parses; null means not linked.
  accountPersonId: Id.nullable().optional(),
});
export type Person = z.infer<typeof Person>;
