import type { Account, AccountCompany, OnboardingStep } from '@boasis/schema';
import { PLANS } from '../plan';

// Onboarding v2 section C: the order of the steps and where each one lives. Step 1 and step 2
// come before the company exists, so they sit under the add-company route; every later step
// sits under the company.

export const STEP_ORDER: readonly OnboardingStep[] = [
  'add-company',
  'company',
  'people',
  'office',
  'establishment-card',
  'corporate-tax',
  'vat',
  'your-year',
  'employees',
];

// The number shown to the person ("Step 3 of 9"). Step 0 is the account.
export function stepNumber(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step) + 1;
}

export const STEP_COUNT = STEP_ORDER.length;

export function nextStep(step: OnboardingStep): OnboardingStep {
  // Step 9 is offered after step 8, never walked into: after step 7 comes the year.
  if (step === 'your-year' || step === 'employees') {
    return 'your-year';
  }
  return STEP_ORDER[STEP_ORDER.indexOf(step) + 1] ?? 'your-year';
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  if (step === 'employees') {
    return 'your-year';
  }
  const index = STEP_ORDER.indexOf(step);
  return index <= 0 ? null : (STEP_ORDER[index - 1] ?? null);
}

export const ADD_COMPANY_PATH = '/add-company/existing';
export const LICENCE_PATH = '/add-company/existing/licence';

export function stepPath(companyId: string, step: OnboardingStep): string {
  if (step === 'add-company') {
    return ADD_COMPANY_PATH;
  }
  return `/onboarding/${companyId}/${step}`;
}

// Section D: the plan limit is checked at step 1.
export type PlanRoom = { kind: 'room'; left: number } | { kind: 'full'; covers: number };

export function planRoom(account: Account, companies: readonly AccountCompany[]): PlanRoom {
  const covers = PLANS[account.plan].companies;
  const left = covers - companies.length;
  return left > 0 ? { kind: 'room', left } : { kind: 'full', covers };
}

// Step 0: onboarding opens only after the email is verified.
export function canOnboard(account: Account | null): boolean {
  return account !== null && account.emailVerifiedOn !== null;
}
