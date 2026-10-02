import type { Account, AccountPerson, CompanyFacts, Role } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { entryOf, fieldKeeping, fieldOf } from './fields';
import {
  cardItems,
  companyItems,
  corporateTaxItems,
  officeItems,
  peopleItems,
  vatItems,
} from './needs';
import { isTrn, ownershipTooHigh, parseCount, parsePercent, pickList } from './people';
import { companyPeople, snapshotOf, sponsoredCount } from './snapshot';
import { canOnboard, nextStep, planRoom, previousStep, stepNumber, stepPath } from './steps';

const ON = '2026-09-28';
const known = <T>(value: T) => ({
  state: 'known' as const,
  value,
  origin: 'user' as const,
  enteredOn: ON,
});
const later = { state: 'skipped' as const, value: null, origin: 'user' as const, enteredOn: ON };
const notSure = { state: 'unknown' as const, value: null, origin: 'user' as const, enteredOn: ON };

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acc-1',
    fullName: 'Sara Ahmed',
    email: 'sara@example.com',
    plan: 'one-company',
    termsVersion: ON,
    termsAcceptedOn: ON,
    emailVerifiedOn: ON,
    twoStepOn: false,
    emailRemindersOn: true,
    createdOn: ON,
    ...overrides,
  };
}

function person(id: string, sponsorCompany: string | null): AccountPerson {
  return {
    id,
    accountId: 'acc-1',
    name: id,
    email: null,
    passportExpiry: later,
    residenceVisa: {
      sponsor:
        sponsorCompany === null
          ? { kind: 'family' }
          : { kind: 'account-company', companyId: sponsorCompany },
      expiry: known('2027-06-01'),
    },
    emiratesIdExpiry: notSure,
  };
}

function role(personId: string, companyId: string, percent: number | null): Role {
  return {
    personId,
    companyId,
    kind: percent === null ? 'manager' : 'shareholder',
    ownershipPercent: percent === null ? null : known(percent),
  };
}

function facts(overrides: Partial<CompanyFacts> = {}): CompanyFacts {
  return {
    id: 'co-1',
    identity: {
      tradeName: 'Sara Consulting FZCO',
      legalForm: 'fzco',
      authority: 'ifza',
      licenceNumber: 'IFZA-1',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      activities: [],
      incorporationDate: '2025-01-01',
      financialYearEnd: '12-31',
    },
    cards: { immigrationCard: null, mohreCard: null },
    tax: {
      corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
      vat: { status: 'unknown', trn: null },
    },
    visaCapacity: { allowed: 0, used: 0 },
    ...overrides,
  };
}

describe('the step order and the plan', () => {
  it('walks the steps in order and offers step 9 after the year', () => {
    expect(stepNumber('add-company')).toBe(1);
    expect(stepNumber('employees')).toBe(9);
    expect(nextStep('company')).toBe('people');
    expect(nextStep('vat')).toBe('your-year');
    expect(nextStep('employees')).toBe('your-year');
    expect(previousStep('people')).toBe('company');
    expect(previousStep('add-company')).toBeNull();
    expect(stepPath('co-1', 'office')).toBe('/onboarding/co-1/office');
  });

  it('checks the plan limit at step 1', () => {
    const one = account();
    expect(planRoom(one, []).kind).toBe('room');
    const link = { accountId: 'acc-1', companyId: 'co-1', role: 'owner' as const, addedOn: ON };
    expect(planRoom(one, [link])).toEqual({ kind: 'full', covers: 1 });
    expect(planRoom(account({ plan: 'up-to-three' }), [link])).toEqual({ kind: 'room', left: 2 });
  });

  it('opens onboarding only after the email is verified', () => {
    expect(canOnboard(account())).toBe(true);
    expect(canOnboard(account({ emailVerifiedOn: null }))).toBe(false);
    expect(canOnboard(null)).toBe(false);
  });
});

describe('answers and their states', () => {
  it('stores a blank answer as skipped, "Not sure" as unknown, and keeps an unchanged day', () => {
    expect(fieldOf({ kind: 'empty' }, ON).state).toBe('skipped');
    expect(fieldOf({ kind: 'not-sure' }, ON).state).toBe('unknown');
    expect(fieldOf({ kind: 'value', value: 3 }, ON)).toEqual(known(3));
    const old = { ...known('2027-01-01'), enteredOn: '2026-01-01' };
    expect(fieldKeeping({ kind: 'value', value: '2027-01-01' }, old, ON)).toBe(old);
    expect(fieldKeeping({ kind: 'value', value: '2027-02-01' }, old, ON).enteredOn).toBe(ON);
    expect(entryOf(notSure).kind).toBe('not-sure');
  });
});

describe('what we still need', () => {
  it('lists the licence items left unknown or skipped, and the expected expiry only in renewal', () => {
    const profile = {
      licenceStatus: known('renewal-in-progress' as const),
      licenceTermYears: known(1),
      incorporationDate: later,
      website: later,
      handler: notSure,
      licenceExpiryDate: known('2026-09-01'),
      expectedNewExpiry: later,
    };
    const items = companyItems(facts({ profile })).map((item) => item.item);
    expect(items).toEqual(['expected-new-expiry', 'incorporation-date', 'handler']);
    const active = companyItems(
      facts({ profile: { ...profile, licenceStatus: known('active' as const) } }),
    ).map((item) => item.item);
    expect(active).not.toContain('expected-new-expiry');
  });

  it('asks for the people when none were added, else for each missing personal date', () => {
    expect(peopleItems([]).map((item) => item.item)).toEqual(['people']);
    const sara = person('sara', 'co-1');
    const items = peopleItems([{ person: sara, role: role('sara', 'co-1', 100) }]);
    expect(items.map((item) => [item.item, item.personId, item.reason])).toEqual([
      ['passport-expiry', 'sara', 'skipped'],
      ['emirates-id-expiry', 'sara', 'unknown'],
    ]);
    expect(items[0]?.whoCanAnswer).toEqual(['person']);
  });

  it('skips the lease for no office and asks about renewing together only when not sure', () => {
    const none = facts({
      premises: { type: known('none' as const), endDate: later, renewsWithLicence: later },
    });
    expect(officeItems(none)).toEqual([]);
    const desk = facts({
      premises: { type: known('flexi-desk' as const), endDate: later, renewsWithLicence: later },
    });
    expect(officeItems(desk).map((item) => item.item)).toEqual(['lease-end']);
  });

  it('asks the zone for the card and the quota', () => {
    const items = cardItems(
      facts({
        companyCards: [{ kind: 'establishment', expiry: later }],
        visaQuota: { allowed: notSure, used: known(1) },
      }),
    );
    expect(items.map((item) => item.item)).toEqual(['establishment-card', 'visa-quota']);
    expect(items[1]?.whoCanAnswer).toEqual(['zone', 'agent']);
  });

  it('gives a "Not sure" on tax to the accountant', () => {
    const ct = corporateTaxItems(
      facts({
        tax: {
          corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
          vat: { status: 'unknown', trn: null },
          corporateTaxRecord: {
            registered: notSure,
            trn: null,
            firstTaxPeriodEnd: null,
            financialYearEnd: null,
            qfzpIntent: null,
          },
        },
      }),
    );
    expect(ct.map((item) => [item.item, item.whoCanAnswer])).toEqual([
      ['corporate-tax-registration', ['accountant', 'fta']],
    ]);
  });

  it('opens the VAT threshold task on a "Not sure", but not when registering is mandatory anyway', () => {
    const vat = (band: unknown, next30: unknown) =>
      vatItems(
        facts({
          tax: {
            corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
            vat: { status: 'not-registered', trn: null },
            vatRecord: {
              registered: known('no' as const),
              trn: null,
              filingPeriod: null,
              periodEnd: null,
              last12MonthsBand: band as never,
              expectsToPassMandatoryInNext30Days: next30 as never,
            },
          },
        }),
      ).map((item) => item.item);
    expect(vat(known('below-187500'), known('no'))).toEqual([]);
    expect(vat(known('below-187500'), notSure)).toEqual(['vat-threshold']);
    expect(vat(notSure, known('yes'))).toEqual([]);
  });
});

describe('people across companies', () => {
  const sara = person('sara', 'co-1');
  const omar = person('omar', null);
  const joy = person('joy', 'co-1');
  const roles = [role('sara', 'co-1', 60), role('omar', 'co-1', 40)];

  it('keeps ownership at or under 100 across shareholders', () => {
    expect(ownershipTooHigh(roles, { personId: 'omar', percent: 40 })).toBe(false);
    expect(ownershipTooHigh(roles, { personId: 'omar', percent: 41 })).toBe(true);
    expect(ownershipTooHigh(roles, { personId: null, percent: 1 })).toBe(true);
  });

  it('offers the people of other companies, never twice, never employees', () => {
    expect(pickList('co-2', [sara, omar, joy], roles).map((entry) => entry.id)).toEqual([
      'sara',
      'omar',
    ]);
    expect(pickList('co-1', [sara, omar, joy], roles)).toEqual([]);
  });

  it('counts only the visas this company sponsors, and lists employees after owners', () => {
    const people = companyPeople('co-1', [sara, omar, joy], roles);
    expect(people.map((entry) => [entry.person.id, entry.role === null])).toEqual([
      ['sara', false],
      ['omar', false],
      ['joy', true],
    ]);
    expect(sponsoredCount('co-1', people)).toBe(2);
    expect(snapshotOf(facts(), people).people).toHaveLength(3);
  });

  it('reads the numbers the steps take', () => {
    expect(parsePercent('40')).toBe(40);
    expect(parsePercent('100.5')).toBeNull();
    expect(parsePercent('abc')).toBeNull();
    expect(parseCount('3')).toBe(3);
    expect(parseCount('-1')).toBeNull();
    expect(isTrn('100 123 456 789 003')).toBe(true);
    expect(isTrn('12345')).toBe(false);
  });
});

describe('the first tax period task when not registered', () => {
  const record = (yearEnd: unknown) => ({
    registered: known('no' as const),
    trn: null,
    firstTaxPeriodEnd: null,
    financialYearEnd: yearEnd as never,
    qfzpIntent: null,
  });
  const withIncorporation = (date: string) =>
    facts({
      profile: {
        licenceStatus: known('active' as const),
        licenceTermYears: known(1),
        incorporationDate: known(date),
        website: later,
        handler: known({ kind: 'self' as const }),
      },
    });

  it('opens no task when the rule gives one first period end', () => {
    const company = withIncorporation('2024-11-15');
    const items = corporateTaxItems({
      ...company,
      tax: { ...company.tax, corporateTaxRecord: record(known('12-31')) },
    });
    expect(items).toEqual([]);
  });

  it('opens a task when the year end is unknown or two dates are possible', () => {
    const company = withIncorporation('2024-01-31');
    const unknownYear = corporateTaxItems({
      ...company,
      tax: { ...company.tax, corporateTaxRecord: record(notSure) },
    }).map((item) => item.item);
    expect(unknownYear).toEqual(['first-tax-period-end', 'financial-year-end']);
    const two = corporateTaxItems({
      ...company,
      tax: { ...company.tax, corporateTaxRecord: record(known('07-31')) },
    }).map((item) => item.item);
    expect(two).toEqual(['first-tax-period-end']);
  });
});
