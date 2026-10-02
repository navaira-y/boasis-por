import { z } from 'zod';

// A calendar date with no time and no zone: YYYY-MM-DD. Every date in the product is one of
// these; turning it into anything else is the job of packages/rules.
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
export type IsoDate = z.infer<typeof IsoDate>;

// A month and day with no year, for a recurring date such as a financial year end: MM-DD.
export const MonthDay = z.string().regex(/^\d{2}-\d{2}$/, 'expected MM-DD');
export type MonthDay = z.infer<typeof MonthDay>;

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

// The id of a licensing authority, kebab-case and stable. The list itself is
// content/authorities/index.json, not this schema, so any UAE licence can be onboarded on day one.
export const AuthorityId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'expected a kebab-case authority id');
export type AuthorityId = z.infer<typeof AuthorityId>;

// The id of a requirement the engine knows (spec section 11). The list itself is owned by the rules
// and content roles; the schema only fixes the shape.
export const RequirementId = z.string().min(1).brand<'RequirementId'>();
export type RequirementId = z.infer<typeof RequirementId>;

// The access areas of spec section 4.1. Every compliance card belongs to exactly one.
export const Area = z.enum([
  'company-file',
  'offices',
  'documents',
  'people',
  'licence-and-cards',
  'tax-and-accounts',
  'banks',
  'calendar-and-costs',
  'access',
  'billing',
]);
export type Area = z.infer<typeof Area>;

// The seven emirates, spelled as the federal portal spells them.
export const Emirate = z.enum([
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
]);
export type Emirate = z.infer<typeof Emirate>;
