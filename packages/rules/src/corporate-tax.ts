import type { FederalRules, Field, IsoDate, MonthDay, YesNo } from '@boasis/schema';
import { addDays, addMonths, isBefore, nextAfter } from './calendar';
import { basisOf, knownValue, type RuleBasis } from './fields';

// Onboarding v2 sections C step 6 and I: corporate tax registration and returns, from the answers
// and content/federal.json. Nothing here computes a penalty or an amount.

export type CorporateTaxRegistration =
  | { kind: 'registered' }
  // Incorporated on or after the timeline start, and the deadline has not passed.
  | { kind: 'register-by'; dueOn: IsoDate; basis: RuleBasis[] }
  // The deadline has passed. dueOn is null for a company incorporated before the timeline start:
  // every deadline for those fell in 2024, and no per-month table is kept.
  | { kind: 'late'; dueOn: IsoDate | null; basis: RuleBasis[] }
  | { kind: 'unknown'; missing: 'registration-status' | 'incorporation-date' };

export interface CorporateTaxRegistrationInput {
  registered: Field<YesNo> | null | undefined;
  incorporationDate: Field<IsoDate> | null | undefined;
  today: IsoDate;
}

// The registration deadline for a company incorporated on the given day, or null when the company
// was incorporated before the timeline start (its deadline fell in 2024).
export function corporateTaxRegistrationDeadline(
  incorporationDate: IsoDate,
  federal: FederalRules,
): IsoDate | null {
  const { registrationTimelineFrom, registrationMonths } = federal.corporateTax;
  return isBefore(incorporationDate, registrationTimelineFrom.value)
    ? null
    : addMonths(incorporationDate, registrationMonths.value);
}

export function corporateTaxRegistration(
  input: CorporateTaxRegistrationInput,
  federal: FederalRules,
): CorporateTaxRegistration {
  return corporateTaxRegistrationOf(
    knownValue(input.registered),
    knownValue(input.incorporationDate),
    input.today,
    federal,
  );
}

// The same rule from plain values, null meaning not known. The company card reads it this way,
// from the onboarding answers when they exist and the company identity otherwise.
export function corporateTaxRegistrationOf(
  registered: YesNo | null,
  incorporated: IsoDate | null,
  today: IsoDate,
  federal: FederalRules,
): CorporateTaxRegistration {
  if (registered === 'yes') {
    return { kind: 'registered' };
  }
  if (registered === null) {
    return { kind: 'unknown', missing: 'registration-status' };
  }
  if (incorporated === null) {
    return { kind: 'unknown', missing: 'incorporation-date' };
  }
  const basis = [
    basisOf(federal.corporateTax.registrationTimelineFrom),
    basisOf(federal.corporateTax.registrationMonths),
  ];
  const dueOn = corporateTaxRegistrationDeadline(incorporated, federal);
  if (dueOn === null) {
    return { kind: 'late', dueOn: null, basis };
  }
  return isBefore(dueOn, today)
    ? { kind: 'late', dueOn, basis }
    : { kind: 'register-by', dueOn, basis };
}

// The return and payment are due a fixed number of months after each tax period ends.
export function corporateTaxReturnDue(periodEnd: IsoDate, federal: FederalRules): IsoDate {
  return addMonths(periodEnd, federal.corporateTax.returnMonths.value);
}

export type CorporateTaxReturn =
  | { kind: 'dated'; periodEnd: IsoDate; dueOn: IsoDate; first: boolean; basis: RuleBasis[] }
  | { kind: 'unknown'; missing: 'first-tax-period-end' | 'financial-year-end' };

export interface CorporateTaxReturnInput {
  firstTaxPeriodEnd: Field<IsoDate> | null | undefined;
  financialYearEnd: Field<MonthDay> | null | undefined;
  today: IsoDate;
}

// The earliest return still open today: the first one from the first tax period end (a first
// period can run 6 to 18 months, so the financial year end alone cannot give it), every later one
// from the financial year end.
export function nextCorporateTaxReturn(
  input: CorporateTaxReturnInput,
  federal: FederalRules,
): CorporateTaxReturn {
  const first = knownValue(input.firstTaxPeriodEnd);
  if (first === null) {
    return { kind: 'unknown', missing: 'first-tax-period-end' };
  }
  const yearEnd = knownValue(input.financialYearEnd);
  const basis = [basisOf(federal.corporateTax.returnMonths)];
  let periodEnd = first;
  let isFirst = true;
  while (isBefore(corporateTaxReturnDue(periodEnd, federal), input.today)) {
    if (yearEnd === null) {
      return { kind: 'unknown', missing: 'financial-year-end' };
    }
    periodEnd = nextAfter(yearEnd, periodEnd);
    isFirst = false;
  }
  return {
    kind: 'dated',
    periodEnd,
    dueOn: corporateTaxReturnDue(periodEnd, federal),
    first: isFirst,
    basis,
  };
}

// Onboarding v2 step 6, not registered: the first tax period is the first financial year, which
// runs 6 to 18 months from incorporation (FTA Public Clarification CTP003, content/federal.json).
// The year-end dates in that window are the candidates for its end: one gives the first return
// date as a calculation from the rule, two need the person to say which, none is unknown.
export type FirstTaxPeriod =
  | { kind: 'calculated'; periodEnd: IsoDate; basis: RuleBasis[] }
  | { kind: 'choose'; candidates: IsoDate[]; basis: RuleBasis[] }
  | { kind: 'unknown' };

export function firstTaxPeriodCandidates(
  incorporated: IsoDate,
  yearEnd: MonthDay,
  federal: FederalRules,
): IsoDate[] {
  const { min, max } = federal.corporateTax.firstTaxPeriodMonths.value;
  const from = addMonths(incorporated, min);
  const to = addMonths(incorporated, max);
  const candidates: IsoDate[] = [];
  let date = nextAfter(yearEnd, addDays(from, -1));
  while (!isBefore(to, date)) {
    candidates.push(date);
    date = nextAfter(yearEnd, date);
  }
  return candidates;
}

export function firstTaxPeriod(
  incorporationDate: Field<IsoDate> | null | undefined,
  financialYearEnd: Field<MonthDay> | null | undefined,
  federal: FederalRules,
): FirstTaxPeriod {
  const incorporated = knownValue(incorporationDate);
  const yearEnd = knownValue(financialYearEnd);
  if (incorporated === null || yearEnd === null) {
    return { kind: 'unknown' };
  }
  const candidates = firstTaxPeriodCandidates(incorporated, yearEnd, federal);
  const basis = [basisOf(federal.corporateTax.firstTaxPeriodMonths)];
  const [only] = candidates;
  if (candidates.length === 1 && only !== undefined) {
    return { kind: 'calculated', periodEnd: only, basis };
  }
  return candidates.length === 0 ? { kind: 'unknown' } : { kind: 'choose', candidates, basis };
}
