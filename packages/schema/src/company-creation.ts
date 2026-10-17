import { z } from 'zod';

/** One owned company until a real payment integration grants more. Wishes are not entitlements. */
export const CompanyCreationAccess = z.object({
  canCreate: z.boolean(),
  reason: z.enum(['allowed', 'payment-coming-soon', 'subscription-inactive']),
  ownedCompanies: z.number().int().nonnegative(),
  companyLimit: z.literal(1),
}).strict().superRefine((value, context) => {
  const valid = value.reason === 'allowed'
    ? value.canCreate && value.ownedCompanies === 0
    : !value.canCreate && (value.reason !== 'payment-coming-soon' || value.ownedCompanies >= value.companyLimit);
  if (!valid) context.addIssue({ code: 'custom', message: 'Inconsistent company allowance.' });
});
export type CompanyCreationAccess = z.infer<typeof CompanyCreationAccess>;
