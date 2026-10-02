import type {
  FederalRules,
  Field,
  IsoDate,
  VatFilingPeriod,
  VatTurnoverBand,
  YesNo,
} from '@boasis/schema';
import { addDays, isBefore } from './calendar';
import { basisOf, knownValue, type RuleBasis } from './fields';
import { stepPeriodEnd } from './periods';

// Onboarding v2 sections C step 7 and I: VAT registration and returns, from the answers and
// content/federal.json. Nothing here computes a penalty or an amount.

export type VatRegistrationOutcome = 'mandatory' | 'voluntary' | 'not-required' | 'unknown';

export interface VatRegistrationInput {
  last12MonthsBand: Field<VatTurnoverBand> | null | undefined;
  expectsToPassMandatoryInNext30Days: Field<YesNo> | null | undefined;
}

// Mandatory when supplies and imports passed the mandatory threshold over the last 12 months or
// are expected to pass it in the next 30 days; voluntary between the two thresholds; not required
// below; unknown when the band is not known and the 30-day answer is not yes.
export function vatRegistrationOutcome(
  input: VatRegistrationInput,
  federal: FederalRules,
): { outcome: VatRegistrationOutcome; basis: RuleBasis[] } {
  const { mandatoryThresholdAed, voluntaryThresholdAed, expectedWithinDays } = federal.vat;
  const basis = [
    basisOf(mandatoryThresholdAed),
    basisOf(voluntaryThresholdAed),
    basisOf(expectedWithinDays),
  ];
  const band = knownValue(input.last12MonthsBand);
  const expects = knownValue(input.expectsToPassMandatoryInNext30Days);
  if (band === 'above-375000' || expects === 'yes') {
    return { outcome: 'mandatory', basis };
  }
  switch (band) {
    case '187500-375000':
      return { outcome: 'voluntary', basis };
    case 'below-187500':
      return { outcome: 'not-required', basis };
    case null:
      return { outcome: 'unknown', basis };
  }
}

const PERIOD_MONTHS: Record<VatFilingPeriod, number> = { quarterly: 3, monthly: 1 };

// The return and payment are due a fixed number of days after each tax period ends.
export function vatReturnDue(periodEnd: IsoDate, federal: FederalRules): IsoDate {
  return addDays(periodEnd, federal.vat.returnDays.value);
}

export type VatReturn =
  | { kind: 'dated'; periodEnd: IsoDate; dueOn: IsoDate; basis: RuleBasis[] }
  | { kind: 'unknown'; missing: 'filing-period' | 'period-end' };

export interface VatReturnInput {
  filingPeriod: Field<VatFilingPeriod> | null | undefined;
  periodEnd: Field<IsoDate> | null | undefined;
  today: IsoDate;
}

// The earliest return still open today, stepping from the one period end the person entered by
// the filing period.
export function nextVatReturn(input: VatReturnInput, federal: FederalRules): VatReturn {
  const filingPeriod = knownValue(input.filingPeriod);
  if (filingPeriod === null) {
    return { kind: 'unknown', missing: 'filing-period' };
  }
  const anchor = knownValue(input.periodEnd);
  if (anchor === null) {
    return { kind: 'unknown', missing: 'period-end' };
  }
  const months = PERIOD_MONTHS[filingPeriod];
  let periodEnd = anchor;
  while (isBefore(vatReturnDue(periodEnd, federal), input.today)) {
    periodEnd = stepPeriodEnd(periodEnd, months);
  }
  for (;;) {
    const previous = stepPeriodEnd(periodEnd, -months);
    if (isBefore(vatReturnDue(previous, federal), input.today)) {
      break;
    }
    periodEnd = previous;
  }
  return {
    kind: 'dated',
    periodEnd,
    dueOn: vatReturnDue(periodEnd, federal),
    basis: [basisOf(federal.vat.returnDays)],
  };
}
