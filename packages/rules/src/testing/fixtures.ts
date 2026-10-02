import type {
  AuthorityFile,
  AuthorityId,
  Card,
  CompanyFacts,
  Document,
  Fact,
  Office,
  Person,
} from '@boasis/schema';
import { requirementId, type RequirementKey } from '../requirements';

// Sample data for the tests. Every value here is a fixture, not a fact about any authority or
// company; the real files live in content/ and are filled by the Content role.

export const TODAY = '2026-09-12';

export function fact<T>(value: T, grade: Fact<T>['grade'] = 'confirmed'): Fact<T> {
  return { value, source: 'test fixture', lastChecked: TODAY, grade };
}

function identity(id: AuthorityId): AuthorityFile['identity'] {
  const mainland = id === 'dubai-mainland';
  return {
    name: fact(mainland ? 'Dubai mainland' : 'SRTIP'),
    emirate: fact(mainland ? 'Dubai' : 'Sharjah'),
    type: fact(mainland ? 'mainland' : 'free-zone'),
    visaSponsor: fact(mainland ? 'mohre' : 'zone'),
    submissionChannel: fact(''),
    portalAddress: fact(''),
  };
}

// A file with every flag the rules read, so the "yes" and "no" branches can be tested.
export function mainlandAuthority(overrides: Partial<AuthorityFile> = {}): AuthorityFile {
  return {
    id: 'dubai-mainland',
    version: 'test',
    identity: identity('dubai-mainland'),
    licence: {
      renewalLeadDays: fact(90),
      prerequisites: { leaseMinimumRemainingDays: fact(30), auditRequired: fact(true) },
    },
    cards: [],
    premises: { ejariRequired: fact(true) },
    people: {
      passportValidityNewMonths: fact(6),
      passportValidityRenewalMonths: fact(6),
      permitValidityMonths: fact(2),
      entryToResidencyDays: fact(60),
      wpsApplies: fact(true),
      emiratisationInScope: fact(true),
    },
    companyRequirements: {
      auditRequiredForRenewal: fact(true),
      generalAssemblyRule: fact('within four months of the financial year end'),
      amlActivities: fact(['6820']),
      sectorPermits: fact([{ activityCode: '5610', permit: 'food permit' }]),
    },
    playbooks: [],
    library: [],
    ...overrides,
  };
}

export function srtipAuthority(overrides: Partial<AuthorityFile> = {}): AuthorityFile {
  return {
    id: 'srtip',
    version: 'test',
    identity: identity('srtip'),
    licence: { renewalLeadDays: fact(90) },
    cards: [],
    premises: { ejariRequired: fact(false), termFollowsLicence: fact(true) },
    people: {
      passportValidityNewMonths: fact(8),
      passportValidityRenewalMonths: fact(6),
      permitValidityMonths: fact(2),
      entryToResidencyDays: fact(55),
      wpsApplies: fact(false),
      emiratisationInScope: fact(false),
    },
    companyRequirements: {
      auditRequiredForRenewal: fact(false),
      amlActivities: fact([]),
      sectorPermits: fact([]),
    },
    playbooks: [],
    library: [],
    ...overrides,
  };
}

// The placeholder shape shipped by the foundation: identity only, every flag absent.
export function emptyAuthority(id: AuthorityId): AuthorityFile {
  return {
    id,
    version: 'test',
    identity: identity(id),
    licence: {},
    cards: [],
    premises: {},
    people: {},
    companyRequirements: {},
    playbooks: [],
    library: [],
  };
}

// Objects may be given in part, arrays whole, and a nullable object may be given as null.
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : NonNullable<T[K]> extends object
      ? DeepPartial<NonNullable<T[K]>> | Extract<T[K], null>
      : T[K];
};

export function srtipFacts(overrides: DeepPartial<CompanyFacts> = {}): CompanyFacts {
  const base: CompanyFacts = {
    id: 'co-srtip',
    identity: {
      tradeName: 'Noor Digital FZE',
      legalForm: 'fze',
      authority: 'srtip',
      licenceNumber: 'SRTIP-0001',
      issueDate: '2025-10-01',
      expiryDate: '2026-09-30',
      activities: [{ code: '6201', name: 'Software', addedOn: '2025-10-01', removedOn: null }],
      incorporationDate: '2025-10-01',
      financialYearEnd: '12-31',
    },
    cards: { immigrationCard: { number: 'IMM-1', expiry: '2026-09-30' }, mohreCard: null },
    tax: {
      corporateTax: { registered: true, registrationNumber: 'CT-1', registeredOn: '2025-11-15' },
      vat: { status: 'not-registered', trn: null, periodEnd: null, periodMonths: null },
    },
    visaCapacity: { allowed: 3, used: 2 },
    banks: [
      {
        id: 'bank-1',
        bankName: 'Sample Bank',
        kycRefreshOn: '2027-03-01',
        licenceSentOn: '2025-10-15',
      },
    ],
    ubo: { declaredOn: '2025-10-20', lastOwnershipChangeOn: null },
    decision: null,
  };
  return merge(base, overrides);
}

export function mainlandFacts(overrides: DeepPartial<CompanyFacts> = {}): CompanyFacts {
  const base: CompanyFacts = {
    id: 'co-mainland',
    identity: {
      tradeName: 'Al Noor Trading LLC',
      legalForm: 'llc',
      authority: 'dubai-mainland',
      licenceNumber: 'DET-0002',
      issueDate: '2024-03-01',
      expiryDate: '2027-02-28',
      activities: [
        { code: '4690', name: 'General trading', addedOn: '2024-03-01', removedOn: null },
      ],
      incorporationDate: '2024-03-01',
      financialYearEnd: '12-31',
    },
    cards: {
      immigrationCard: { number: 'IMM-2', expiry: '2027-02-28' },
      mohreCard: { number: 'MOH-2', expiry: '2027-02-28' },
    },
    tax: {
      corporateTax: { registered: true, registrationNumber: 'CT-2', registeredOn: '2024-05-01' },
      vat: {
        status: 'registered',
        trn: '100000000000003',
        periodEnd: '2026-06-30',
        periodMonths: 3,
      },
    },
    visaCapacity: { allowed: 6, used: 3 },
    banks: [
      {
        id: 'bank-2',
        bankName: 'Sample Bank',
        kycRefreshOn: '2026-12-01',
        licenceSentOn: '2024-03-20',
      },
    ],
    ubo: { declaredOn: '2024-04-01', lastOwnershipChangeOn: null },
    decision: null,
  };
  return merge(base, overrides);
}

export function flexiDesk(companyId: string, overrides: DeepPartial<Office> = {}): Office {
  const base: Office = {
    id: `${companyId}-office`,
    companyId,
    premises: {
      type: 'flexi-desk',
      address: 'SRTIP, Sharjah',
      sizeSqm: null,
      servesActivityCodes: ['6201'],
      isRegisteredAddress: true,
    },
    lease: {
      landlord: 'SRTIP',
      start: '2025-10-01',
      end: '2026-09-30',
      noticePeriodDays: null,
      rentAed: null,
      securityDepositAed: null,
      paymentSchedule: [],
      ejari: null,
      tenancyContractDocumentId: null,
    },
    approvals: [],
    services: {
      electricityAndWaterAccount: null,
      telecomAccount: null,
      buildingAccess: null,
      parking: null,
    },
    capacity: { quotaAllowed: 3, quotaUsed: 2 },
  };
  return merge(base, overrides);
}

export function mainlandOffice(companyId: string, overrides: DeepPartial<Office> = {}): Office {
  const base: Office = {
    id: `${companyId}-office`,
    companyId,
    premises: {
      type: 'dedicated-office',
      address: 'Business Bay, Dubai',
      sizeSqm: 60,
      servesActivityCodes: ['4690'],
      isRegisteredAddress: true,
    },
    lease: {
      landlord: 'Sample Landlord',
      start: '2026-04-01',
      end: '2027-03-31',
      noticePeriodDays: 90,
      rentAed: 80000,
      securityDepositAed: 4000,
      paymentSchedule: [
        { dueOn: '2026-04-01', amountAed: 20000, method: 'cheque' },
        { dueOn: '2026-07-01', amountAed: 20000, method: 'cheque' },
        { dueOn: '2026-10-01', amountAed: 20000, method: 'cheque' },
        { dueOn: '2027-01-01', amountAed: 20000, method: 'cheque' },
      ],
      ejari: { number: 'EJ-1', expiry: '2027-03-31' },
      tenancyContractDocumentId: null,
    },
    approvals: [],
    services: {
      electricityAndWaterAccount: 'DEWA-1',
      telecomAccount: 'DU-1',
      buildingAccess: null,
      parking: null,
    },
    capacity: { quotaAllowed: 6, quotaUsed: 3 },
  };
  return merge(base, overrides);
}

export function person(companyId: string, id: string, overrides: DeepPartial<Person> = {}): Person {
  const base: Person = {
    id,
    companyId,
    identity: {
      name: 'Sample Person',
      nationality: 'Sample',
      passportNumber: `P-${id}`,
      passportIssue: '2022-01-10',
      passportExpiry: '2032-01-09',
      dateOfBirth: '1990-05-04',
      role: 'Manager',
      startDate: '2025-11-01',
      emirateOfWork: 'Sharjah',
      language: 'en',
      noticeConsent: true,
    },
    status: {
      type: 'employee',
      sponsor: { kind: 'company', personId: null },
      mohrePermitType: null,
      stage: 'residence-visa',
      entryPermitIssuedOn: '2025-11-05',
      entryDate: '2025-11-20',
      visaNumber: 'V-1',
      unifiedNumber: null,
      visaExpiry: '2027-11-19',
      emiratesIdNumber: 'EID-1',
      emiratesIdExpiry: '2027-11-19',
      workPermitExpiry: null,
      contractType: 'unlimited',
      noticePeriodDays: 30,
      contractStart: '2025-12-01',
      contractEnd: null,
      probationEnd: null,
      leaveBalanceDays: null,
      lastExitDate: null,
    },
    cover: {
      healthInsurance: { policyNumber: 'POL-1', endDate: '2026-11-19', paidBy: 'employer' },
      unemploymentInsurance: null,
    },
    pay: {
      basicSalaryAed: 8000,
      totalSalaryAed: 12000,
      payDay: 1,
      underWps: null,
      endOfServiceAccruedAed: null,
    },
    contact: { email: null, phone: null },
    notify: true,
  };
  return merge(base, overrides);
}

// A person at the start of the chain: entry permit issued, not yet in the country.
export function newHire(
  companyId: string,
  id: string,
  overrides: DeepPartial<Person> = {},
): Person {
  const hire = person(companyId, id, {
    identity: { startDate: null },
    status: {
      stage: 'entry-permit',
      entryPermitIssuedOn: '2026-09-01',
      entryDate: null,
      visaNumber: null,
      visaExpiry: null,
      emiratesIdNumber: null,
      emiratesIdExpiry: null,
      contractType: null,
      noticePeriodDays: null,
      contractStart: null,
    },
    cover: { healthInsurance: null },
  });
  return merge(hire, overrides);
}

export function document(
  companyId: string,
  id: string,
  overrides: DeepPartial<Document> = {},
): Document {
  const base: Document = {
    id,
    companyId,
    personId: null,
    type: 'licence',
    title: 'Sample document',
    issueDate: '2025-10-01',
    expiryDate: '2026-09-30',
    fileName: `${id}.pdf`,
    uploadedOn: '2025-10-02',
    version: 1,
  };
  return merge(base, overrides);
}

export function card(companyId: string, key: RequirementKey, overrides: Partial<Card> = {}): Card {
  return {
    id: `${key}:${companyId}:open`,
    companyId,
    requirementId: requirementId(key),
    area: 'licence-and-cards',
    state: 'on-track',
    dueOn: null,
    actBy: null,
    subjectId: null,
    responsibleId: null,
    steps: [],
    evidence: [],
    ...overrides,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeRecords(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    const current = result[key];
    result[key] =
      isPlainObject(current) && isPlainObject(value) ? mergeRecords(current, value) : value;
  }
  return result;
}

// A deep merge for fixtures: objects merge, arrays and scalars replace, null replaces.
export function merge<T>(base: T, overrides: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(overrides)) {
    return overrides as T;
  }
  return mergeRecords(base, overrides) as T;
}
