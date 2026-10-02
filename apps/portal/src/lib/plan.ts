import type { Plan } from '@boasis/schema';

// The plan, in one place. Spec 12.1 is a working model: the unit is the person, not the
// company, and every figure is an example under discussion, so each one is named as such on
// the billing screen. Nothing is charged today.
export const PLAN = {
  // Paid by the person who creates the account. Covers their own access and one more person.
  ownerPriceAed: 90,
  // Every further person given access, whatever their role or number of companies.
  memberPriceAed: 50,
  companiesIncluded: 3,
  membersIncluded: 1,
  // People on visas per company inside Standard; above the hard line the account is an
  // Enterprise conversation.
  peopleCapPerCompany: 20,
  peopleHardLine: 50,
  peopleAddOnBlock: 10,
  trialDays: 14,
  graceDays: 14,
  readOnlyDays: 60,
  exportMonths: 12,
} as const;

// Onboarding v2 decision 4 and step 0: the two plans the account chooses between. Nothing is
// charged in the mock; when the plan is charged is open decision 1.
export const PLANS: Readonly<
  Record<Plan, { readonly companies: number; readonly priceAed: number }>
> = {
  'one-company': { companies: 1, priceAed: 30 },
  'up-to-three': { companies: 3, priceAed: 90 },
};

// The terms and privacy notice version the step 0 tick accepts.
export const TERMS_VERSION = '2026-09-28';
