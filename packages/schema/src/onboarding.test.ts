import { describe, expect, it } from 'vitest';
import {
  Account,
  AccountCompany,
  AccountPerson,
  CompanyCardRecords,
  CompanyFacts,
  CorporateTaxRecord,
  field,
  IsoDate,
  OnboardingProgress,
  OnboardingTask,
  Role,
  VatRecord,
  VisaSponsor,
  WaitlistEntry,
  ZoneRenewalFacts,
} from './index';

const on = '2026-09-28';
const known = <T>(value: T) => ({
  state: 'known' as const,
  value,
  origin: 'user' as const,
  enteredOn: on,
});
const notSure = { state: 'unknown' as const, value: null, origin: 'user' as const, enteredOn: on };
const later = { state: 'skipped' as const, value: null, origin: 'user' as const, enteredOn: on };

describe('user-entered fields', () => {
  const date = field(IsoDate);

  it('holds a known value, a "not sure" and a skip, each with its origin and day', () => {
    expect(date.parse(known('2027-01-31')).value).toBe('2027-01-31');
    expect(date.parse(notSure).state).toBe('unknown');
    expect(date.parse(later).state).toBe('skipped');
    expect(date.parse({ ...known('2027-01-31'), origin: 'document' }).origin).toBe('document');
  });

  it('refuses a value on an unknown or skipped field, and a skip from a document', () => {
    expect(date.safeParse({ ...notSure, value: '2027-01-31' }).success).toBe(false);
    expect(date.safeParse({ ...later, origin: 'document' }).success).toBe(false);
    expect(date.safeParse({ state: 'known', value: '2027-01-31', origin: 'user' }).success).toBe(
      false,
    );
  });
});

describe('people and roles', () => {
  const person = {
    id: 'hp-1',
    accountId: 'acc-1',
    name: 'Sara Ahmed',
    email: null,
    passportExpiry: known('2030-05-01'),
    residenceVisa: {
      sponsor: { kind: 'account-company', companyId: 'co-1' },
      expiry: known('2027-02-01'),
    },
    emiratesIdExpiry: later,
  };

  it('keeps one set of personal dates per human, with the sponsor named', () => {
    const parsed = AccountPerson.parse(person);
    expect(parsed.residenceVisa.sponsor).toEqual({ kind: 'account-company', companyId: 'co-1' });
    const abroad = AccountPerson.parse({
      ...person,
      residenceVisa: { sponsor: { kind: 'not-resident' }, expiry: null },
      emiratesIdExpiry: null,
    });
    expect(abroad.residenceVisa.expiry).toBeNull();
    expect(
      AccountPerson.safeParse({
        ...person,
        residenceVisa: { sponsor: { kind: 'account-company' }, expiry: null },
      }).success,
    ).toBe(false);
  });

  it('asks ownership of a shareholder and only of a shareholder', () => {
    const base = { personId: 'hp-1', companyId: 'co-1' };
    expect(Role.safeParse({ ...base, kind: 'both', ownershipPercent: known(60) }).success).toBe(
      true,
    );
    expect(Role.safeParse({ ...base, kind: 'shareholder', ownershipPercent: later }).success).toBe(
      true,
    );
    expect(Role.safeParse({ ...base, kind: 'manager', ownershipPercent: null }).success).toBe(true);
    expect(Role.safeParse({ ...base, kind: 'shareholder', ownershipPercent: null }).success).toBe(
      false,
    );
    expect(Role.safeParse({ ...base, kind: 'manager', ownershipPercent: known(10) }).success).toBe(
      false,
    );
    expect(Role.safeParse({ ...base, kind: 'both', ownershipPercent: known(101) }).success).toBe(
      false,
    );
  });
});

describe('company records', () => {
  it('keys company cards by kind, one each', () => {
    const establishment = { kind: 'establishment', expiry: known('2027-03-01') };
    expect(
      CompanyCardRecords.safeParse([establishment, { kind: 'chamber', expiry: later }]).success,
    ).toBe(true);
    expect(CompanyCardRecords.safeParse([establishment, establishment]).success).toBe(false);
  });

  it('reads the tax answers of each branch', () => {
    expect(
      CorporateTaxRecord.parse({
        registered: known('yes'),
        trn: later,
        firstTaxPeriodEnd: known('2026-12-31'),
        financialYearEnd: known('12-31'),
        qfzpIntent: notSure,
      }).qfzpIntent?.state,
    ).toBe('unknown');
    const vat = VatRecord.parse({
      registered: known('no'),
      trn: null,
      filingPeriod: null,
      periodEnd: null,
      last12MonthsBand: known('187500-375000'),
      expectsToPassMandatoryInNext30Days: notSure,
    });
    expect(vat.last12MonthsBand?.value).toBe('187500-375000');
    expect(VatRecord.safeParse({ ...vat, last12MonthsBand: known('unknown') }).success).toBe(false);
  });

  it('carries the onboarding blocks on the company file, and still parses a file without them', () => {
    const facts = {
      id: 'co-1',
      identity: {
        tradeName: 'Sample FZE',
        legalForm: 'fze',
        authority: 'ifza',
        licenceNumber: 'L-1',
        issueDate: '2025-10-01',
        expiryDate: '2026-09-30',
        activities: [],
        incorporationDate: '2025-10-01',
        financialYearEnd: '12-31',
      },
      cards: { immigrationCard: null, mohreCard: null },
      tax: {
        corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
        vat: { status: 'unknown', trn: null },
      },
      visaCapacity: { allowed: 1, used: 1 },
    };
    expect(CompanyFacts.parse(facts).profile).toBeUndefined();
    const parsed = CompanyFacts.parse({
      ...facts,
      profile: {
        licenceStatus: known('renewal-in-progress'),
        licenceTermYears: known(1),
        incorporationDate: known('2025-10-01'),
        website: later,
        handler: known({ kind: 'agent', name: 'Setup Partner', email: null }),
      },
      premises: {
        type: known('flexi-desk'),
        endDate: known('2026-09-30'),
        renewsWithLicence: notSure,
      },
      companyCards: [{ kind: 'establishment', expiry: notSure }],
    });
    expect(parsed.profile?.handler.value).toEqual({
      kind: 'agent',
      name: 'Setup Partner',
      email: null,
    });
  });
});

describe('onboarding progress and the mainland waitlist', () => {
  it('parses both', () => {
    expect(
      OnboardingProgress.parse({ companyId: 'co-1', lastStep: 'office', updatedOn: on }).lastStep,
    ).toBe('office');
    expect(
      WaitlistEntry.parse({
        id: 'w-1',
        accountId: 'acc-1',
        email: 'owner@example.com',
        emirate: 'Sharjah',
        emailConsent: true,
        createdOn: on,
      }).emirate,
    ).toBe('Sharjah');
  });
});

describe('the account, its companies and the onboarding tasks', () => {
  it('keeps the plan, the terms version and day, and whether the email is verified', () => {
    const account = Account.parse({
      id: 'acc-1',
      fullName: 'Sara Ahmed',
      email: 'sara@example.com',
      plan: 'one-company',
      termsVersion: '2026-09',
      termsAcceptedOn: on,
      emailVerifiedOn: null,
      twoStepOn: false,
      emailRemindersOn: true,
      createdOn: on,
    });
    expect(account.emailVerifiedOn).toBeNull();
    expect(Account.safeParse({ ...account, plan: 'five' }).success).toBe(false);
  });

  it('holds a task per open item with who can answer it', () => {
    const task = OnboardingTask.parse({
      id: 't-1',
      companyId: 'co-1',
      item: 'incorporation-date',
      personId: null,
      reason: 'skipped',
      whoCanAnswer: ['you'],
      status: 'open',
      createdOn: on,
    });
    expect(task.item).toBe('incorporation-date');
    expect(OnboardingTask.safeParse({ ...task, whoCanAnswer: [] }).success).toBe(false);
  });

  it('knows a company of the account by its role, and a sponsor not on Boasis yet', () => {
    expect(
      AccountCompany.parse({ accountId: 'acc-1', companyId: 'co-1', role: 'adviser', addedOn: on })
        .role,
    ).toBe('adviser');
    expect(VisaSponsor.parse({ kind: 'own-company-not-on-boasis' }).kind).toBe(
      'own-company-not-on-boasis',
    );
  });

  it('reads a zone renewal fact by its shape', () => {
    const facts = ZoneRenewalFacts.partial().parse({
      'licence.graceDays': { value: 0, source: 'zone FAQ', lastChecked: on, grade: 'confirmed' },
    });
    expect(facts['licence.graceDays']?.value).toBe(0);
  });
});
