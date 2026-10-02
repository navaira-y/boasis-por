import { z } from 'zod';
import { Id, IsoDate } from './common';
import { field } from './field';

// Onboarding v2 section C step 3 and F: one record per human on the account. Passport, visa and
// Emirates ID are stored once here, whichever company they were entered under; the person's part
// in each company is a Role. Nothing company-specific lives on this record.

// Who sponsors the person's residence visa. A company on the account is named by its id, so the
// same record reads as "this company" from that company and "another of my companies" from any
// other; only the sponsoring company uses a place in its visa quota. Not sure is not offered:
// the question is required.
export const VisaSponsor = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('account-company'), companyId: Id }),
  // "Another of my companies" when that company is not on Boasis yet: kept as another company,
  // and the person is offered to add it next. It uses no place in any quota on the account.
  z.object({ kind: z.literal('own-company-not-on-boasis') }),
  z.object({ kind: z.literal('family') }),
  z.object({ kind: z.literal('other-employer') }),
  z.object({ kind: z.literal('not-resident') }),
]);
export type VisaSponsor = z.infer<typeof VisaSponsor>;

export const ResidenceVisa = z.object({
  sponsor: VisaSponsor,
  // Asked only of a resident; null when the sponsor is not-resident.
  expiry: field(IsoDate).nullable(),
});
export type ResidenceVisa = z.infer<typeof ResidenceVisa>;

export const AccountPerson = z.object({
  id: Id,
  accountId: Id,
  name: z.string().min(1),
  email: z.string().email().nullable(),
  passportExpiry: field(IsoDate),
  residenceVisa: ResidenceVisa,
  // Asked only of a resident; null when the sponsor is not-resident.
  emiratesIdExpiry: field(IsoDate).nullable(),
});
export type AccountPerson = z.infer<typeof AccountPerson>;

// A person's part in one company. Employees keep the company-scoped Person record in person.ts.
export const RoleKind = z.enum(['shareholder', 'manager', 'both']);
export type RoleKind = z.infer<typeof RoleKind>;

export const Role = z
  .object({
    personId: Id,
    companyId: Id,
    kind: RoleKind,
    // Asked when the person is a shareholder; null for a manager only.
    ownershipPercent: field(z.number().min(0).max(100)).nullable(),
  })
  .refine((role) => (role.kind === 'manager') === (role.ownershipPercent === null), {
    message: 'ownership is asked of a shareholder and only of a shareholder',
  });
export type Role = z.infer<typeof Role>;
