import { PRODUCT_PLANS, type Plan } from '@boasis/schema';

// Legacy onboarding identifiers only. Published names are Solo and Trio; these
// values never grant access or replace an authenticated subscription read.
export const PLANS: Readonly<
  Record<Plan, { readonly companies: number; readonly priceAed: number }>
> = {
  'one-company': {
    companies: PRODUCT_PLANS[0].maxCompanies,
    priceAed: PRODUCT_PLANS[0].priceFils / 100,
  },
  'up-to-three': {
    companies: PRODUCT_PLANS[1].maxCompanies,
    priceAed: PRODUCT_PLANS[1].priceFils / 100,
  },
};

// The terms and privacy notice version the step 0 tick accepts.
export const TERMS_VERSION = '2026-09-28';
