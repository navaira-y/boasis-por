import type { IsoDate, VatFilingPeriod, VatTurnoverBand, YesNo } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { FEDERAL } from './testing/federal';
import { known, notSure, skipped } from './testing/fields';
import { nextVatReturn, vatRegistrationOutcome, vatReturnDue } from './vat';

function outcome(band: VatTurnoverBand | 'not-sure', expects: YesNo | 'not-sure' | null) {
  return vatRegistrationOutcome(
    {
      last12MonthsBand: band === 'not-sure' ? notSure() : known(band),
      expectsToPassMandatoryInNext30Days:
        expects === null ? null : expects === 'not-sure' ? notSure() : known(expects),
    },
    FEDERAL,
  ).outcome;
}

describe('VAT registration', () => {
  it('is mandatory above the threshold over the last 12 months', () => {
    expect(outcome('above-375000', 'no')).toBe('mandatory');
  });

  it('is mandatory when supplies are expected to pass it in the next 30 days', () => {
    expect(outcome('below-187500', 'yes')).toBe('mandatory');
    expect(outcome('not-sure', 'yes')).toBe('mandatory');
  });

  it('is voluntary between the two thresholds and not required below', () => {
    expect(outcome('187500-375000', 'no')).toBe('voluntary');
    expect(outcome('187500-375000', 'not-sure')).toBe('voluntary');
    expect(outcome('below-187500', 'no')).toBe('not-required');
    expect(outcome('below-187500', null)).toBe('not-required');
  });

  it('is unknown when the band is not known', () => {
    expect(outcome('not-sure', 'no')).toBe('unknown');
    expect(outcome('not-sure', null)).toBe('unknown');
  });

  it('names its sources', () => {
    const { basis } = vatRegistrationOutcome(
      { last12MonthsBand: known('above-375000'), expectsToPassMandatoryInNext30Days: null },
      FEDERAL,
    );
    expect(basis.length).toBeGreaterThan(0);
    for (const entry of basis) {
      expect(entry.source).toContain('https://tax.gov.ae/');
      expect(entry.grade).toBe('confirmed');
    }
  });

  it('matches the band names to the thresholds in content', () => {
    expect(FEDERAL.vat.mandatoryThresholdAed.value).toBe(375000);
    expect(FEDERAL.vat.voluntaryThresholdAed.value).toBe(187500);
    expect(FEDERAL.vat.expectedWithinDays.value).toBe(30);
  });
});

describe('VAT returns', () => {
  function next(filing: VatFilingPeriod | null, periodEnd: IsoDate | null, today: IsoDate) {
    return nextVatReturn(
      {
        filingPeriod: filing === null ? skipped() : known(filing),
        periodEnd: periodEnd === null ? notSure() : known(periodEnd),
        today,
      },
      FEDERAL,
    );
  }

  it('falls due 28 days after the period end', () => {
    expect(vatReturnDue('2026-09-30', FEDERAL)).toBe('2026-10-28');
    expect(vatReturnDue('2026-01-31', FEDERAL)).toBe('2026-02-28');
  });

  it('keeps the last period open until its due day', () => {
    expect(next('quarterly', '2026-06-30', '2026-09-28')).toMatchObject({
      periodEnd: '2026-09-30',
      dueOn: '2026-10-28',
    });
    expect(next('quarterly', '2026-09-30', '2026-10-28')).toMatchObject({
      periodEnd: '2026-09-30',
    });
    expect(next('quarterly', '2026-09-30', '2026-10-29')).toMatchObject({
      periodEnd: '2026-12-31',
      dueOn: '2027-01-28',
    });
  });

  it('steps month ends to month ends, forwards and back', () => {
    expect(next('quarterly', '2027-03-31', '2026-10-01')).toMatchObject({
      periodEnd: '2026-09-30',
    });
    expect(next('monthly', '2026-01-31', '2026-04-15')).toMatchObject({
      periodEnd: '2026-03-31',
      dueOn: '2026-04-28',
    });
  });

  it('is unknown without the filing period or a period end', () => {
    expect(next(null, '2026-06-30', '2026-09-28')).toEqual({
      kind: 'unknown',
      missing: 'filing-period',
    });
    expect(next('monthly', null, '2026-09-28')).toEqual({ kind: 'unknown', missing: 'period-end' });
  });
});
