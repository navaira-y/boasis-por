import { describe, expect, it } from 'vitest';
import { CompanyCreationAccess } from './company-creation';

const allowed = { canCreate: true, reason: 'allowed', ownedCompanies: 0, companyLimit: 1 };
describe('company creation allowance', () => {
  it('allows a first company only', () => {
    expect(CompanyCreationAccess.parse(allowed).canCreate).toBe(true);
  });
  it('represents payment coming soon without granting another company', () => {
    expect(CompanyCreationAccess.parse({ ...allowed, canCreate: false, reason: 'payment-coming-soon', ownedCompanies: 1 }).canCreate).toBe(false);
  });
  it('represents inactive access even before the first company', () => {
    expect(CompanyCreationAccess.parse({ ...allowed, canCreate: false, reason: 'subscription-inactive' }).canCreate).toBe(false);
  });
  it.each([
    { ...allowed, ownedCompanies: 1 },
    { ...allowed, companyLimit: 3 },
    { ...allowed, canCreate: false },
    { ...allowed, reason: 'payment-coming-soon' },
    { ...allowed, reason: 'subscription-inactive' },
    { ...allowed, ownedCompanies: -1 },
    { ...allowed, ownedCompanies: 0.5 },
    { ...allowed, extra: 'not part of the contract' },
    {},
  ])('refuses malformed or contradictory entitlements: %j', (value) => {
    expect(CompanyCreationAccess.safeParse(value).success).toBe(false);
  });
});
