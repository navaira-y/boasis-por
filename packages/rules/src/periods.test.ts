import { describe, expect, it } from 'vitest';
import {
  currentMonthEnd,
  currentPayDay,
  currentQuarterEnd,
  currentVatPeriodEnd,
  stepPeriodEnd,
  currentYearEnd,
  nextMonthEnd,
  nextPayDay,
  nextQuarterEnd,
  nextYearEnd,
} from './periods';

describe('year ends', () => {
  it('takes the latest year end on or before today', () => {
    expect(currentYearEnd('12-31', '2026-09-12', '2024-03-01')).toBe('2025-12-31');
    expect(currentYearEnd('06-30', '2026-09-12', '2024-03-01')).toBe('2026-06-30');
  });

  it('uses the first year end after incorporation for a young company', () => {
    expect(currentYearEnd('12-31', '2026-09-12', '2026-02-01')).toBe('2026-12-31');
  });

  it('steps to the next year end, clamping 29 February', () => {
    expect(nextYearEnd('12-31', '2025-12-31')).toBe('2026-12-31');
    expect(nextYearEnd('02-29', '2028-02-29')).toBe('2029-02-28');
  });
});

describe('quarters', () => {
  it('finds the current and next calendar quarter end', () => {
    expect(currentQuarterEnd('2026-09-12')).toBe('2026-06-30');
    expect(currentQuarterEnd('2026-09-30')).toBe('2026-09-30');
    expect(currentQuarterEnd('2026-01-05')).toBe('2025-12-31');
    expect(nextQuarterEnd('2026-06-30')).toBe('2026-09-30');
    expect(nextQuarterEnd('2026-12-31')).toBe('2027-03-31');
  });
});

describe('VAT periods', () => {
  it('steps from any known period end', () => {
    expect(currentVatPeriodEnd('2026-06-30', 3, '2026-09-12')).toBe('2026-06-30');
    expect(currentVatPeriodEnd('2025-03-31', 3, '2026-09-12')).toBe('2026-06-30');
    expect(currentVatPeriodEnd('2027-12-31', 3, '2026-09-12')).toBe('2026-06-30');
    expect(currentVatPeriodEnd('2026-08-31', 1, '2026-09-12')).toBe('2026-08-31');
  });

  it('keeps month ends on month ends, 28 and 29 February included', () => {
    expect(stepPeriodEnd('2026-09-30', 3)).toBe('2026-12-31');
    expect(stepPeriodEnd('2026-12-31', -3)).toBe('2026-09-30');
    expect(stepPeriodEnd('2026-11-30', 3)).toBe('2027-02-28');
    expect(stepPeriodEnd('2027-11-30', 3)).toBe('2028-02-29');
    expect(stepPeriodEnd('2027-02-28', 3)).toBe('2027-05-31');
    expect(stepPeriodEnd('2028-02-29', 12)).toBe('2029-02-28');
    expect(stepPeriodEnd('2027-02-28', 12)).toBe('2028-02-29');
    expect(stepPeriodEnd('2026-01-15', 1)).toBe('2026-02-15');
    // Stepped across a year of quarters from 30 September, the current end is 31 December.
    expect(currentVatPeriodEnd('2025-09-30', 3, '2027-01-05')).toBe('2026-12-31');
    expect(currentVatPeriodEnd('2025-09-30', 3, '2026-12-30')).toBe('2026-09-30');
    expect(currentVatPeriodEnd('2026-11-30', 3, '2027-03-01')).toBe('2027-02-28');
    expect(currentVatPeriodEnd('2027-11-30', 3, '2028-02-29')).toBe('2028-02-29');
    expect(currentVatPeriodEnd('2028-02-29', 1, '2028-06-01')).toBe('2028-05-31');
  });
});

describe('months', () => {
  it('finds pay days and month ends', () => {
    expect(currentPayDay('2026-09-12')).toBe('2026-09-01');
    expect(nextPayDay('2026-09-01')).toBe('2026-10-01');
    expect(nextPayDay('2026-12-01')).toBe('2027-01-01');
    expect(currentMonthEnd('2026-02-10')).toBe('2026-02-28');
    expect(nextMonthEnd('2026-01-31')).toBe('2026-02-28');
    expect(nextMonthEnd('2028-01-31')).toBe('2028-02-29');
  });
});
