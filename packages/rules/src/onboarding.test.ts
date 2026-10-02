import type { CorporateTaxRecord, VatRecord } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { computeCards } from './cards';
import { firstTaxPeriod, firstTaxPeriodCandidates } from './corporate-tax';
import {
  combinedYear,
  daysSinceExpiry,
  decisionPointDate,
  establishmentCardCondition,
  expiryAfterIssue,
  isAfterToday,
  isFarFuture,
  itemStatus,
  leaseEndsBeforeLicence,
  leaseUnderMinimum,
  licenceRenewalDate,
  qfzpAudit,
  reminderDates,
  snapshotDates,
  visasLeft,
  type CompanySnapshot,
} from './onboarding';
import { FEDERAL } from './testing/federal';
import { known, notSure, skipped } from './testing/fields';
import { srtipAuthority, srtipFacts } from './testing/fixtures';

const TODAY = '2026-09-28';

function taxRecord(overrides: Partial<CorporateTaxRecord> = {}): CorporateTaxRecord {
  return {
    registered: known('yes'),
    trn: null,
    firstTaxPeriodEnd: null,
    financialYearEnd: null,
    qfzpIntent: null,
    ...overrides,
  };
}

function vatRecord(overrides: Partial<VatRecord> = {}): VatRecord {
  return {
    registered: known('yes'),
    trn: null,
    filingPeriod: null,
    periodEnd: null,
    last12MonthsBand: null,
    expectsToPassMandatoryInNext30Days: null,
    ...overrides,
  };
}

describe('date checks (section B.7)', () => {
  it('refuses an expiry on or before the issue date', () => {
    expect(expiryAfterIssue('2026-01-01', '2027-01-01')).toBe(true);
    expect(expiryAfterIssue('2027-01-01', '2026-01-01')).toBe(false);
    expect(expiryAfterIssue('2027-01-01', '2027-01-01')).toBe(false);
  });

  it('asks about a date more than ten years out', () => {
    expect(isFarFuture('2036-09-28', TODAY)).toBe(false);
    expect(isFarFuture('2036-09-29', TODAY)).toBe(true);
  });

  it('knows a date after today', () => {
    expect(isAfterToday('2026-09-29', TODAY)).toBe(true);
    expect(isAfterToday(TODAY, TODAY)).toBe(false);
  });
});

describe('the step computations', () => {
  it('lists the reminders still ahead, earliest first', () => {
    expect(reminderDates('2026-12-31', [90, 60, 30, 14, 7, 1], TODAY)).toEqual([
      '2026-10-02',
      '2026-11-01',
      '2026-12-01',
      '2026-12-17',
      '2026-12-24',
      '2026-12-30',
    ]);
    expect(reminderDates('2026-10-10', [90, 60, 30, 14, 7, 1], TODAY)).toEqual([
      '2026-10-03',
      '2026-10-09',
    ]);
  });

  it('renews from the expected new expiry while a renewal is in progress', () => {
    expect(
      licenceRenewalDate(known('renewal-in-progress'), known('2026-09-01'), known('2027-09-01')),
    ).toBe('2027-09-01');
    expect(licenceRenewalDate(known('active'), known('2026-12-01'), known('2027-09-01'))).toBe(
      '2026-12-01',
    );
    expect(licenceRenewalDate(known('active'), skipped(), null)).toBeNull();
  });

  it('opens the decision point 90 days before expiry and counts days since expiry', () => {
    expect(decisionPointDate('2026-12-31')).toBe('2026-10-02');
    expect(daysSinceExpiry('2026-09-18', TODAY)).toBe(10);
  });

  it('warns when the lease ends before the licence or under the zone minimum', () => {
    expect(leaseEndsBeforeLicence(known('2026-11-01'), '2026-12-01')).toBe(true);
    expect(leaseEndsBeforeLicence(known('2027-01-01'), '2026-12-01')).toBe(false);
    expect(leaseEndsBeforeLicence(notSure(), '2026-12-01')).toBe(false);
    expect(leaseUnderMinimum(known('2026-12-01'), 90, TODAY)).toBe(true);
    expect(leaseUnderMinimum(known('2027-06-01'), 90, TODAY)).toBe(false);
  });

  it('reads the establishment card as expired, expiring, valid or unknown', () => {
    expect(establishmentCardCondition(known('2026-09-01'), TODAY)).toBe('expired');
    expect(establishmentCardCondition(known('2026-11-01'), TODAY)).toBe('expiring');
    expect(establishmentCardCondition(known('2027-11-01'), TODAY)).toBe('valid');
    expect(establishmentCardCondition(skipped(), TODAY)).toBe('unknown');
  });

  it('counts visas left and flags more visas than the quota', () => {
    expect(visasLeft({ allowed: known(3), used: known(1) })).toEqual({
      kind: 'known',
      left: 2,
      over: false,
    });
    expect(visasLeft({ allowed: known(1), used: known(2) })).toEqual({
      kind: 'known',
      left: 0,
      over: true,
    });
    expect(visasLeft({ allowed: skipped(), used: known(2) })).toEqual({ kind: 'unknown' });
  });

  it('requires audited accounts only when the company claims QFZP status', () => {
    expect(qfzpAudit(known('yes'), FEDERAL)?.required).toBe(true);
    expect(qfzpAudit(known('yes'), FEDERAL)?.basis[0]?.grade).toBe('confirmed');
    expect(qfzpAudit(notSure(), FEDERAL)).toBeNull();
  });
});

describe('the dates so far and the year', () => {
  const solo: CompanySnapshot = {
    companyId: 'co-1',
    licenceStatus: known('active'),
    licenceExpiry: known('2027-03-31'),
    incorporationDate: known('2025-04-01'),
    premises: {
      type: known('flexi-desk'),
      endDate: known('2027-03-31'),
      renewsWithLicence: known('yes'),
    },
    establishmentCard: known('2027-04-15'),
    corporateTax: taxRecord({ registered: notSure() }),
    vat: vatRecord({ registered: known('no') }),
    people: [
      {
        id: 'p-1',
        name: 'Sara Ahmed',
        passportExpiry: known('2029-06-30'),
        visaExpiry: known('2027-10-01'),
        emiratesIdExpiry: known('2027-10-01'),
      },
    ],
  };

  it('fills in each date as its answer arrives', () => {
    const empty = snapshotDates({ companyId: 'co-1' }, FEDERAL, TODAY);
    expect(empty.dated).toEqual([]);
    const kinds = snapshotDates(solo, FEDERAL, TODAY).dated.map((entry) => entry.kind);
    expect(kinds).toContain('licence-renewal');
    expect(kinds).toContain('decision-point');
    expect(kinds).toContain('lease-end');
    expect(kinds).toContain('establishment-card');
    expect(kinds).toContain('passport-alert');
    expect(kinds).toContain('visa-expiry');
    expect(kinds).not.toContain('corporate-tax-registration');
    expect(kinds).not.toContain('vat-return');
  });

  it('gives the passport alert its federal source', () => {
    const passport = snapshotDates(solo, FEDERAL, TODAY).dated.find(
      (entry) => entry.kind === 'passport-alert',
    );
    expect(passport?.dueOn).toBe('2028-12-30');
    expect(passport?.basis[0]?.source).toContain('icp.gov.ae');
  });

  it('dates the corporate tax registration inside the three months, and shows late without a date before March 2024', () => {
    const young = snapshotDates(
      {
        companyId: 'co-2',
        incorporationDate: known('2026-08-15'),
        corporateTax: taxRecord({ registered: known('no') }),
      },
      FEDERAL,
      TODAY,
    );
    const registration = young.dated.find((entry) => entry.kind === 'corporate-tax-registration');
    expect(registration?.dueOn).toBe('2026-11-15');
    expect(registration?.reminders).toEqual([
      '2026-10-16',
      '2026-11-01',
      '2026-11-08',
      '2026-11-14',
    ]);
    const old = snapshotDates(
      {
        companyId: 'co-3',
        incorporationDate: known('2023-05-01'),
        corporateTax: taxRecord({ registered: known('no') }),
      },
      FEDERAL,
      TODAY,
    );
    expect(old.late).toHaveLength(1);
    expect(old.dated.find((entry) => entry.kind === 'corporate-tax-registration')).toBeUndefined();
  });

  it('dates the corporate tax and VAT returns from the answers', () => {
    const dates = snapshotDates(
      {
        companyId: 'co-4',
        corporateTax: taxRecord({
          firstTaxPeriodEnd: known('2026-12-31'),
          financialYearEnd: known('12-31'),
        }),
        vat: vatRecord({ filingPeriod: known('quarterly'), periodEnd: known('2026-09-30') }),
      },
      FEDERAL,
      TODAY,
    );
    const ct = dates.dated.find((entry) => entry.kind === 'corporate-tax-return');
    expect(ct?.dueOn).toBe('2027-09-30');
    expect(ct?.first).toBe(true);
    const vat = dates.dated.find((entry) => entry.kind === 'vat-return');
    expect(vat?.dueOn).toBe('2026-10-28');
    expect(vat?.reminders).toEqual(['2026-10-14', '2026-10-21', '2026-10-27']);
  });

  it('combines companies, shows a person once, and puts the next three first', () => {
    const second: CompanySnapshot = {
      companyId: 'co-5',
      licenceStatus: known('active'),
      licenceExpiry: known('2026-11-30'),
      people: solo.people ?? [],
    };
    const year = combinedYear([solo, second], FEDERAL, TODAY);
    expect(year.personal.filter((entry) => entry.kind === 'visa-expiry')).toHaveLength(1);
    expect(year.next).toHaveLength(3);
    expect(year.next[0]?.companyId).toBe('co-5');
    // Its decision point (90 days before 30 Nov) has come: "now", listed first.
    expect(year.next[0]?.kind).toBe('decision-point');
  });
});

describe('the licence card reads the onboarding answers', () => {
  it('is unknown when the expiry was skipped', () => {
    const facts = srtipFacts();
    const onboarded = {
      ...facts,
      profile: {
        licenceStatus: known('active' as const),
        licenceTermYears: known(1),
        incorporationDate: skipped<string>(),
        website: skipped<string>(),
        handler: known({ kind: 'self' as const }),
        licenceExpiryDate: skipped<string>(),
      },
    };
    const cards = computeCards({
      facts: onboarded,
      offices: [],
      people: [],
      documents: [],
      existingCards: [],
      authority: srtipAuthority(),
      federal: FEDERAL,
      today: TODAY,
      holidays: [],
    });
    const licence = cards.find((card) => card.requirementId === 'licence-renewal');
    expect(licence?.dueOn).toBeNull();
    expect(licence?.state).toBe('unknown');
  });
});

describe('the first tax period when not registered (CTP003)', () => {
  it('calculates the only year end 6 to 18 months after incorporation', () => {
    const result = firstTaxPeriod(known('2024-11-15'), known('12-31'), FEDERAL);
    expect(result.kind).toBe('calculated');
    expect(result.kind === 'calculated' ? result.periodEnd : null).toBe('2025-12-31');
    expect(result.kind === 'calculated' ? result.basis[0]?.source : '').toContain('CTP003');
  });

  it('asks which when two year ends fall in the window, and is unknown without inputs', () => {
    expect(firstTaxPeriodCandidates('2024-01-31', '07-31', FEDERAL)).toEqual([
      '2024-07-31',
      '2025-07-31',
    ]);
    expect(firstTaxPeriod(known('2024-01-31'), known('07-31'), FEDERAL).kind).toBe('choose');
    expect(firstTaxPeriod(skipped(), known('12-31'), FEDERAL).kind).toBe('unknown');
    expect(firstTaxPeriod(known('2024-11-15'), notSure(), FEDERAL).kind).toBe('unknown');
  });

  it('shows the first return due 30 Sep 2026 for the solo founder, marked calculated', () => {
    const dates = snapshotDates(
      {
        companyId: 'co-s',
        incorporationDate: known('2024-11-15'),
        corporateTax: taxRecord({ registered: known('no'), financialYearEnd: known('12-31') }),
      },
      FEDERAL,
      TODAY,
    );
    const ct = dates.dated.find((entry) => entry.kind === 'corporate-tax-return');
    expect(ct?.dueOn).toBe('2026-09-30');
    expect(ct?.calculated).toBe(true);
    expect(ct?.first).toBe(true);
  });
});

// The coordinator's walk-through account: incorporated 15 Nov 2024, licence expiry 14 Nov 2026,
// own visa, passport April 2027, flexi desk to 1 Oct 2026, not registered for corporate tax with
// a 31 Dec year end, not registered for VAT with sales below the voluntary threshold.
const SOLO_FOUNDER: CompanySnapshot = {
  companyId: 'co-s',
  licenceStatus: known('active'),
  licenceExpiry: known('2026-11-14'),
  incorporationDate: known('2024-11-15'),
  premises: {
    type: known('flexi-desk'),
    endDate: known('2026-10-01'),
    renewsWithLicence: skipped(),
  },
  establishmentCard: skipped(),
  corporateTax: taxRecord({ registered: known('no'), financialYearEnd: known('12-31') }),
  vat: vatRecord({
    registered: known('no'),
    last12MonthsBand: known('below-187500'),
    expectsToPassMandatoryInNext30Days: known('no'),
  }),
  people: [
    {
      id: 'p-sara',
      name: 'Sara',
      sponsoredHere: true,
      passportExpiry: known('2027-04-30'),
      visaExpiry: known('2028-03-01'),
      emiratesIdExpiry: known('2028-03-01'),
    },
  ],
};

describe('late deadlines and "now" markers', () => {
  it('reads a passed deadline as late and a passed marker as now', () => {
    expect(itemStatus({ kind: 'corporate-tax-registration', dueOn: '2025-02-15' }, TODAY)).toBe(
      'late',
    );
    expect(itemStatus({ kind: 'passport-alert', dueOn: '2026-09-01' }, TODAY)).toBe('now');
    expect(itemStatus({ kind: 'decision-point', dueOn: TODAY }, TODAY)).toBe('now');
    expect(itemStatus({ kind: 'licence-renewal', dueOn: '2026-11-14' }, TODAY)).toBe('upcoming');
  });

  it('orders Next 3 by urgency for the solo IFZA founder', () => {
    const year = combinedYear([SOLO_FOUNDER], FEDERAL, TODAY);
    expect(year.next.map((entry) => [entry.kind, 'dueOn' in entry ? entry.dueOn : null])).toEqual([
      ['corporate-tax-registration', '2025-02-15'],
      ['corporate-tax-return', '2026-09-30'],
      ['lease-end', '2026-10-01'],
    ]);
  });

  it('puts "now" markers ahead of deadlines more than 14 days out', () => {
    const year = combinedYear(
      [{ ...SOLO_FOUNDER, premises: null, corporateTax: null }],
      FEDERAL,
      TODAY,
    );
    expect(year.next.map((entry) => entry.kind)).toEqual([
      'passport-early-warning',
      'decision-point',
      'licence-renewal',
    ]);
  });
});

describe('the cards of an onboarded company', () => {
  const facts = () => {
    const base = srtipFacts();
    return {
      ...base,
      tax: { ...base.tax, vat: { status: 'not-registered' as const, trn: null } },
      profile: {
        licenceStatus: known('active' as const),
        licenceTermYears: known(1),
        incorporationDate: known('2024-11-15'),
        website: skipped<string>(),
        handler: known({ kind: 'self' as const }),
        licenceExpiryDate: known('2026-11-14'),
      },
    };
  };
  const cardsFor = (onboarding: CompanySnapshot | null) =>
    computeCards({
      facts: facts(),
      offices: [],
      people: [],
      documents: [],
      existingCards: [],
      authority: srtipAuthority(),
      federal: FEDERAL,
      today: TODAY,
      holidays: [],
      onboarding,
    });
  const key = (card: { requirementId: string }) => card.requirementId;

  it('shows the older turnover question as late without the onboarding answers', () => {
    const legacy = cardsFor(null).find((card) => key(card) === 'turnover-question');
    expect(legacy?.state).toBe('overdue');
  });

  it('takes the answered items from the onboarding, the same dates as the year', () => {
    const cards = cardsFor(SOLO_FOUNDER);
    const ids = cards.map(key);
    expect(ids).not.toContain('turnover-question');
    expect(ids).not.toContain('vat-registration');
    expect(cards.find((card) => key(card) === 'corporate-tax-return')?.dueOn).toBe('2026-09-30');
    expect(cards.find((card) => key(card) === 'office-lease-renewal')?.dueOn).toBe('2026-10-01');
    expect(cards.find((card) => key(card) === 'passport-expiry')?.dueOn).toBe('2027-04-30');
    expect(cards.find((card) => key(card) === 'residence-visa-renewal')?.dueOn).toBe('2028-03-01');
    expect(cards.find((card) => key(card) === 'immigration-card-renewal')?.state).toBe('unknown');
    // Only the real overdue deadline reads overdue.
    expect(cards.filter((card) => card.state === 'overdue').map(key)).toEqual([
      'corporate-tax-registration',
    ]);
  });
});
