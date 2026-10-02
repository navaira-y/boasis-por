import { z } from 'zod';
import { fact, FactGrade } from './authority';
import { IsoDate } from './common';

// A federal value a live rule depends on: always known, with its source and grade. A rule whose
// value is not established is not a live rule; it is an open entry below.
function ruleValue<T extends z.ZodTypeAny>(value: T) {
  return z.object({
    value,
    source: z.string().min(1),
    lastChecked: IsoDate,
    grade: FactGrade,
  });
}

// content/federal.json: the UAE federal rules that are the same under every authority, each value
// with its source and grade (onboarding v2 section I). Nothing here is a fine or an amount due.
export const FederalRules = z.object({
  version: z.string().min(1),
  ubo: z.object({
    declarationDays: ruleValue(z.number().int().positive()),
    updateDays: ruleValue(z.number().int().positive()),
  }),
  corporateTax: z.object({
    // Companies incorporated on or after this day register within registrationMonths.
    registrationTimelineFrom: ruleValue(IsoDate),
    registrationMonths: ruleValue(z.number().int().positive()),
    returnMonths: ruleValue(z.number().int().positive()),
    // The first tax period is the first financial year, this many months from incorporation.
    firstTaxPeriodMonths: ruleValue(
      z.object({ min: z.number().int().positive(), max: z.number().int().positive() }),
    ),
    // What a late registration leads to, in words (section 8: no amounts).
    lateRegistrationConsequence: ruleValue(z.string().min(1)),
    // A company claiming Qualifying Free Zone Person status must have audited financial statements.
    qfzpAuditedAccounts: ruleValue(z.boolean()),
    // Not a live rule: its status is unverified (section I).
    lateRegistrationWaiver: fact(z.string().min(1)),
  }),
  vat: z.object({
    mandatoryThresholdAed: ruleValue(z.number().int().positive()),
    voluntaryThresholdAed: ruleValue(z.number().int().positive()),
    // The forward-looking test: supplies expected to pass the mandatory threshold in this many days.
    expectedWithinDays: ruleValue(z.number().int().positive()),
    returnDays: ruleValue(z.number().int().positive()),
    // Not a live rule: unverified at article level (section I).
    applicationWindowDays: fact(z.number().int().positive()),
  }),
  passport: z.object({
    // The passport must have at least this many months left to renew a residence visa.
    residenceRenewalMonths: ruleValue(z.number().int().positive()),
  }),
});
export type FederalRules = z.infer<typeof FederalRules>;
