import { z } from 'zod';
import { AuthorityId, Emirate, Id, IsoDate } from './common';

// Onboarding v2 section C: the steps in order. Step 0 (the account) comes before any company.
export const OnboardingStep = z.enum([
  'add-company',
  'company',
  'people',
  'office',
  'establishment-card',
  'corporate-tax',
  'vat',
  'your-year',
  'employees',
]);
export type OnboardingStep = z.infer<typeof OnboardingStep>;

// Section B.3: progress saves after every step, per company, so leaving and coming back resumes
// on the same step.
export const OnboardingProgress = z.object({
  companyId: Id,
  lastStep: OnboardingStep,
  updatedOn: IsoDate,
});
export type OnboardingProgress = z.infer<typeof OnboardingProgress>;

// Section C step 1, mainland branch: interest in mainland, kept outside the company file.
export const WaitlistEntry = z.object({
  id: Id,
  accountId: Id,
  email: z.string().email(),
  emirate: Emirate,
  emailConsent: z.boolean(),
  createdOn: IsoDate,
});
export type WaitlistEntry = z.infer<typeof WaitlistEntry>;

// Section A decision 4 and step 0: the two plans. How many companies each covers and its price
// live with the plan copy in the portal; the account stores only which one was chosen.
export const Plan = z.enum(['one-company', 'up-to-three']);
export type Plan = z.infer<typeof Plan>;

// Step 0: the account is created before onboarding, and onboarding opens only once the email is
// verified. The password is never stored here; it belongs to the auth provider.
export const Account = z.object({
  id: Id,
  fullName: z.string().min(2).max(100),
  email: z.string().email(),
  plan: Plan,
  // The terms and privacy notice accepted, by version and day.
  termsVersion: z.string().min(1),
  termsAcceptedOn: IsoDate,
  // Null until the verification link is followed.
  emailVerifiedOn: IsoDate.nullable(),
  // Two-step sign-in is offered, never forced.
  twoStepOn: z.boolean(),
  // Section E: reminders by email, on by default to the account email.
  emailRemindersOn: z.boolean(),
  createdOn: IsoDate,
});
export type Account = z.infer<typeof Account>;

// Step 1: who the person signed in is to this company. An adviser (accountant, PRO, agent) may
// create the company; the owner is invited later.
export const AccountRoleInCompany = z.enum(['owner', 'manager', 'adviser']);
export type AccountRoleInCompany = z.infer<typeof AccountRoleInCompany>;

// Which companies an account holds, and in what role. The plan limit counts these.
export const AccountCompany = z.object({
  accountId: Id,
  companyId: Id,
  role: AccountRoleInCompany,
  addedOn: IsoDate,
});
export type AccountCompany = z.infer<typeof AccountCompany>;

// Step 1 answered, step 2 not yet saved: there is no company to hang progress on, so the answers
// wait here and the next visit resumes on step 2.
export const OnboardingStart = z.object({
  accountId: Id,
  authority: AuthorityId,
  role: AccountRoleInCompany,
  updatedOn: IsoDate,
});
export type OnboardingStart = z.infer<typeof OnboardingStart>;

// Section B.2 and F: every item left unknown or skipped becomes a task on the company, with who
// can answer it. The title and the reason are copy, keyed by the item.
export const OnboardingItem = z.enum([
  'legal-form',
  'licence-issue-date',
  'licence-expiry-date',
  'expected-new-expiry',
  'incorporation-date',
  'activities',
  'handler',
  'people',
  'passport-expiry',
  'visa-expiry',
  'emirates-id-expiry',
  'office-type',
  'lease-end',
  'renews-with-licence',
  'establishment-card',
  'visa-quota',
  'visas-used',
  'corporate-tax-registration',
  'first-tax-period-end',
  'financial-year-end',
  'qfzp',
  'vat-registration',
  'vat-filing-period',
  'vat-period-end',
  'vat-threshold',
]);
export type OnboardingItem = z.infer<typeof OnboardingItem>;

export const WhoCanAnswer = z.enum(['you', 'person', 'agent', 'accountant', 'zone', 'fta']);
export type WhoCanAnswer = z.infer<typeof WhoCanAnswer>;

export const OnboardingTask = z.object({
  id: Id,
  companyId: Id,
  item: OnboardingItem,
  // The person the item is about (a passport, a visa); null for a company item.
  personId: Id.nullable(),
  // Why the item is open: the person said "not sure", or chose "I'll add this later".
  reason: z.enum(['unknown', 'skipped']),
  whoCanAnswer: z.array(WhoCanAnswer).min(1),
  // Open until the item is answered; dismissed when the person says it does not apply.
  status: z.enum(['open', 'done', 'dismissed']),
  createdOn: IsoDate,
});
export type OnboardingTask = z.infer<typeof OnboardingTask>;

// Step 8: reminders go to the account email; a second address may be added per company, for
// example the agent's.
export const CompanyReminderEmail = z.object({
  companyId: Id,
  secondEmail: z.string().email().nullable(),
});
export type CompanyReminderEmail = z.infer<typeof CompanyReminderEmail>;
