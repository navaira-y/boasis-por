import type { IsoDate, MonthDay, YesNo } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import {
  corporateTaxRegistration,
  corporateTaxRegistrationDeadline,
  corporateTaxReturnDue,
  nextCorporateTaxReturn,
} from './corporate-tax';
import { FEDERAL } from './testing/federal';
import { known, notSure, skipped } from './testing/fields';

const TODAY = '2026-09-28';

function registration(registered: YesNo | 'not-sure', incorporated: IsoDate | null) {
  return corporateTaxRegistration(
    {
      registered: registered === 'not-sure' ? notSure() : known(registered),
      incorporationDate: incorporated === null ? skipped() : known(incorporated),
      today: TODAY,
    },
    FEDERAL,
  );
}

describe('corporate tax registration', () => {
  it('gives incorporation plus three months from 1 March 2024 on', () => {
    expect(corporateTaxRegistrationDeadline('2024-03-01', FEDERAL)).toBe('2024-06-01');
    expect(corporateTaxRegistrationDeadline('2026-08-31', FEDERAL)).toBe('2026-11-30');
  });

  it('has no dated deadline before 1 March 2024: those all fell in 2024', () => {
    expect(corporateTaxRegistrationDeadline('2024-02-29', FEDERAL)).toBeNull();
    expect(corporateTaxRegistrationDeadline('2019-05-10', FEDERAL)).toBeNull();
  });

  it('says register by the deadline while it has not passed, the deadline day included', () => {
    const due = registration('no', '2026-08-01');
    expect(due).toMatchObject({ kind: 'register-by', dueOn: '2026-11-01' });
    expect(registration('no', '2026-06-28')).toMatchObject({
      kind: 'register-by',
      dueOn: TODAY,
    });
    if (due.kind === 'register-by') {
      expect(due.basis.every((basis) => basis.grade === 'confirmed')).toBe(true);
      expect(due.basis[0]?.source).toContain('https://tax.gov.ae/');
    }
  });

  it('says late once the deadline has passed', () => {
    expect(registration('no', '2026-06-27')).toMatchObject({ kind: 'late', dueOn: '2026-09-27' });
  });

  it('says late with no date for a company incorporated before 1 March 2024', () => {
    expect(registration('no', '2023-01-15')).toMatchObject({ kind: 'late', dueOn: null });
  });

  it('is unknown without the incorporation date, and without the registration answer', () => {
    expect(registration('no', null)).toEqual({ kind: 'unknown', missing: 'incorporation-date' });
    expect(registration('not-sure', '2026-08-01')).toEqual({
      kind: 'unknown',
      missing: 'registration-status',
    });
  });

  it('asks nothing more of a registered company', () => {
    expect(registration('yes', null)).toEqual({ kind: 'registered' });
  });
});

describe('corporate tax returns', () => {
  function next(first: IsoDate | null, yearEnd: MonthDay | null, today = TODAY) {
    return nextCorporateTaxReturn(
      {
        firstTaxPeriodEnd: first === null ? notSure() : known(first),
        financialYearEnd: yearEnd === null ? skipped() : known(yearEnd),
        today,
      },
      FEDERAL,
    );
  }

  it('falls due nine months after the period end', () => {
    expect(corporateTaxReturnDue('2025-12-31', FEDERAL)).toBe('2026-09-30');
  });

  it('dates the first return from the first tax period end, which can be longer than a year', () => {
    expect(next('2026-12-31', '12-31')).toMatchObject({
      kind: 'dated',
      periodEnd: '2026-12-31',
      dueOn: '2027-09-30',
      first: true,
    });
  });

  it('dates later returns from the financial year end once the first has passed', () => {
    expect(next('2025-06-30', '03-31')).toMatchObject({
      kind: 'dated',
      periodEnd: '2026-03-31',
      dueOn: '2026-12-31',
      first: false,
    });
  });

  it('keeps the current return open until its due day', () => {
    expect(next('2025-12-31', '12-31', '2026-09-30')).toMatchObject({
      periodEnd: '2025-12-31',
      first: true,
    });
    expect(next('2025-12-31', '12-31', '2026-10-01')).toMatchObject({
      periodEnd: '2026-12-31',
      first: false,
    });
  });

  it('is unknown without the first tax period end', () => {
    expect(next(null, '12-31')).toEqual({ kind: 'unknown', missing: 'first-tax-period-end' });
  });

  it('is unknown past the first return without the financial year end', () => {
    expect(next('2024-12-31', null)).toEqual({ kind: 'unknown', missing: 'financial-year-end' });
    expect(next('2026-06-30', null)).toMatchObject({ kind: 'dated', first: true });
  });
});
