import { MOCK_VERSION, type OnboardingData } from './store';
import { TERMS_VERSION } from '../../lib/plan';
import { federalRules } from '../../content/federal';
import {
  addDays,
  addMonths,
  cardId,
  currentQuarterEnd,
  currentVatPeriodEnd,
  currentYearEnd,
  requirementId,
  firstDayOfMonth,
  lastDayOfMonth,
  nextYearEnd,
  type RequirementKey,
} from '@boasis/rules';
import type {
  AccessGrant,
  Actor,
  Area,
  AuditEvent,
  Card,
  CompanyFacts,
  Document,
  DocumentType,
  DocumentVersion,
  Evidence,
  HistoryEntry,
  IsoDate,
  Office,
  Person,
  Stage,
} from '@boasis/schema';
import { today } from '../../lib/today';
import { toJson } from './fieldChanges';
import type { MockData } from './store';

// The demo account: five companies the signed-in owner holds, one company someone else shares
// with her, and enough people, offices, documents and closed cards that every card state of
// spec 7.1 appears on the compliance board on the day the seed is made. Every date is placed
// relative to today through packages/rules, so the states hold whichever day the app is first
// opened. Names, numbers and amounts are sample data: no real person, licence or company.

export const OWNER_EMAIL = 'owner@example.com';
export const OWNER_NAME = 'Layla Haddad';

export const DEMO_COMPANY_ID = 'co-demo-noor';
export const DEMO_COMPANY_NAME = 'Noor Digital FZE';
export const ALREEF_ID = 'co-alreef';
export const MARASI_ID = 'co-marasi';
export const QASR_ID = 'co-qasr';
export const HAMDAN_ID = 'co-hamdan';
// Owned by someone else and shared with the signed-in owner. The schema has no owner field on a
// company, so the sharing is expressed the one way it can be: an access grant whose member is
// the signed-in owner herself. The home screen reads that grant as "shared with me".
export const SHARED_COMPANY_ID = 'co-sahara';

export const DEMO_COMPANY_IDS = [
  ALREEF_ID,
  DEMO_COMPANY_ID,
  MARASI_ID,
  QASR_ID,
  HAMDAN_ID,
  SHARED_COMPANY_ID,
] as const;

interface PersonInput {
  id: string;
  companyId: string;
  name: string;
  nationality: string;
  passport: string;
  passportExpiry: IsoDate | null;
  role: string;
  emirate: string;
  type: Person['status']['type'];
  sponsor?: Person['status']['sponsor'];
  stage: Stage;
  entryPermitIssuedOn?: IsoDate | null;
  entryDate?: IsoDate | null;
  visaExpiry?: IsoDate | null;
  emiratesIdExpiry?: IsoDate | null;
  workPermitExpiry?: IsoDate | null;
  contractStart?: IsoDate | null;
  contractEnd?: IsoDate | null;
  insuranceEnd?: IsoDate | null;
  // Undefined: no certificate recorded at all. Null: a certificate without a known end date.
  unemploymentUntil?: IsoDate | null;
  underWps?: boolean | null;
  email?: string | null;
  // The access grant this person is assigned to (spec 4.1).
  assigneeId?: string | null;
}

function person(input: PersonInput): Person {
  const visaExpiry = input.visaExpiry ?? null;
  const tail = input.id.slice(-4);
  return {
    id: input.id,
    companyId: input.companyId,
    identity: {
      name: input.name,
      nationality: input.nationality,
      passportNumber: input.passport,
      passportIssue: input.passportExpiry === null ? null : addMonths(input.passportExpiry, -120),
      passportExpiry: input.passportExpiry,
      dateOfBirth: null,
      role: input.role,
      startDate: input.contractStart ?? input.entryDate ?? null,
      emirateOfWork: input.emirate,
      language: 'en',
      noticeConsent: true,
    },
    status: {
      type: input.type,
      sponsor: input.sponsor ?? { kind: 'company', personId: null },
      mohrePermitType: null,
      stage: input.stage,
      entryPermitIssuedOn: input.entryPermitIssuedOn ?? null,
      entryDate: input.entryDate ?? null,
      visaNumber: visaExpiry === null ? null : `DEMO-VISA-${tail}`,
      unifiedNumber: null,
      visaExpiry,
      emiratesIdNumber: input.emiratesIdExpiry == null ? null : `784-0000-${tail}-0`,
      emiratesIdExpiry: input.emiratesIdExpiry ?? null,
      workPermitExpiry: input.workPermitExpiry ?? null,
      contractType: input.contractStart == null ? null : 'unlimited',
      noticePeriodDays: input.contractStart == null ? null : 30,
      contractStart: input.contractStart ?? null,
      contractEnd: input.contractEnd ?? null,
      probationEnd: null,
      leaveBalanceDays: null,
      lastExitDate: null,
    },
    cover: {
      healthInsurance:
        input.insuranceEnd == null
          ? null
          : { policyNumber: `POL-${tail}`, endDate: input.insuranceEnd, paidBy: 'employer' },
      unemploymentInsurance:
        input.unemploymentUntil === undefined
          ? null
          : {
              certificateNumber: input.unemploymentUntil === null ? null : `ILOE-${tail}`,
              validUntil: input.unemploymentUntil,
              duesOutstanding: false,
            },
    },
    pay: {
      basicSalaryAed: input.type === 'dependant' ? null : 8000,
      totalSalaryAed: input.type === 'dependant' ? null : 12000,
      payDay: 1,
      underWps: input.underWps ?? null,
      endOfServiceAccruedAed: null,
    },
    contact: { email: input.email ?? null, phone: null },
    notify: input.email != null,
    assigneeId: input.assigneeId ?? null,
  };
}

interface DocumentInput {
  id: string;
  companyId: string;
  type: DocumentType;
  title: string;
  personId?: string | null;
  issueDate?: IsoDate | null;
  expiryDate?: IsoDate | null;
  uploadedOn: IsoDate;
  extracted?: Document['extracted'];
  officeId?: string | null;
  version?: number;
  previousVersions?: DocumentVersion[];
}

function document(input: DocumentInput): Document {
  return {
    id: input.id,
    companyId: input.companyId,
    personId: input.personId ?? null,
    officeId: input.officeId ?? null,
    type: input.type,
    title: input.title,
    issueDate: input.issueDate ?? null,
    expiryDate: input.expiryDate ?? null,
    fileName: `${input.id}.pdf`,
    uploadedOn: input.uploadedOn,
    version: input.version ?? 1,
    ...(input.extracted === undefined ? {} : { extracted: input.extracted }),
    ...(input.previousVersions === undefined ? {} : { previousVersions: input.previousVersions }),
  };
}

// A card the owner closed with its evidence, under the id packages/rules gives that cycle, so
// the engine shows it as complete and rolls a recurring requirement to its next cycle (spec 7.3).
function closed(
  key: RequirementKey,
  area: Area,
  companyId: string,
  subjectId: string | null,
  dueOn: IsoDate,
  doneOn: IsoDate,
  evidence: Evidence,
  responsibleId: string | null = null,
): Card {
  return {
    id: cardId(requirementId(key), subjectId, companyId, dueOn),
    companyId,
    requirementId: requirementId(key),
    area,
    state: 'complete',
    dueOn,
    actBy: dueOn,
    subjectId,
    responsibleId,
    steps: [{ id: 'done', title: 'I have done this', done: true, doneOn, assigneeId: null }],
    evidence: [evidence],
  };
}

function reference(text: string, date: IsoDate): Evidence {
  return { kind: 'reference', reference: text, date };
}

export function seed(): MockData {
  const T = today();
  const d = (days: number): IsoDate => addDays(T, days);
  const m = (months: number): IsoDate => addMonths(T, months);
  const thisPayDay = firstDayOfMonth(T);
  const lastQuarterEnd = currentQuarterEnd(T);

  // Al Reef Trading LLC: Dubai mainland, an Ejari office, twelve people. Licence 75 days out,
  // so the decision point is open and, with the mainland lead time of 30 days, the licence
  // card reads "decision needed"; the 180 day closing prompt is open as well.
  const alreefExpiry = d(75);
  const alreefIssued = addMonths(alreefExpiry, -12);
  const alreefIncorporated = m(-38);
  const alreefYearEnd = currentYearEnd('12-31', T, alreefIncorporated);
  const alreefVatPeriodEnd = lastDayOfMonth(m(-1));
  // The amended licence that added the retail activity, kept in the vault.
  const alreefAmendedOn = addMonths(alreefIssued, -14);

  // Noor Digital FZE: SRTIP, a flexi-desk, two people. Licence 20 days out: expiring.
  const noorExpiry = d(20);
  const noorIssued = addMonths(noorExpiry, -12);
  const noorIncorporated = m(-23);
  const noorActivityAddedOn = m(-6);

  // Marasi Commodities DMCC: a leased office, five people. Licence 220 days out: on track.
  const marasiExpiry = d(220);
  const marasiIssued = addMonths(marasiExpiry, -12);
  const marasiIncorporated = m(-28);
  const marasiVatAnchor = lastDayOfMonth(m(-2));
  const marasiVatPeriodEnd = currentVatPeriodEnd(marasiVatAnchor, 3, T);

  // Qasr Al Bahr Consultancy: Abu Dhabi mainland sole establishment, one person. Licensed ten
  // months ago, so the licence is about two months out: action soon. Never registered for
  // corporate tax: that card is overdue.
  const qasrIncorporated = m(-10);
  const qasrIssued = qasrIncorporated;
  const qasrExpiry = addMonths(qasrIssued, 12);

  // Hamdan Logistics FZCO: JAFZA, a warehouse, eight people. Licence expired nine days ago.
  const hamdanExpiry = d(-9);
  const hamdanIssued = addMonths(hamdanExpiry, -12);
  const hamdanIncorporated = m(-50);

  // Sahara Ventures FZE: SRTIP, owned by Khalid Mansoor and shared with the signed-in owner.
  // The decision point was answered "cancel", so the exit cards and the cancellation tracker
  // are open.
  const saharaExpiry = d(70);
  const saharaIssued = addMonths(saharaExpiry, -12);
  const saharaIncorporated = m(-30);

  const companies: CompanyFacts[] = [
    {
      id: ALREEF_ID,
      identity: {
        tradeName: 'Al Reef Trading LLC',
        legalForm: 'llc',
        authority: 'dubai-mainland',
        licenceNumber: 'DEMO-DET-104233',
        issueDate: alreefIssued,
        expiryDate: alreefExpiry,
        activities: [
          {
            code: '4620',
            name: 'Wholesale on a fee or contract basis',
            addedOn: alreefIncorporated,
            removedOn: null,
            licenceVersion: { issuedOn: alreefIncorporated, documentId: null },
          },
          {
            code: '4711',
            name: 'Retail sale in non-specialised stores',
            addedOn: alreefAmendedOn,
            removedOn: null,
            licenceVersion: { issuedOn: alreefAmendedOn, documentId: 'do-alreef-amended' },
          },
        ],
        incorporationDate: alreefIncorporated,
        financialYearEnd: '12-31',
        licenceCategory: 'Commercial licence',
        registeredOfficeId: 'of-alreef',
        firstTaxPeriod: {
          start: alreefIncorporated,
          end: nextYearEnd('12-31', alreefIncorporated),
        },
        mohreClassification: '2A',
      },
      cards: {
        immigrationCard: { number: 'DEMO-GDRFA-55120', expiry: alreefExpiry },
        mohreCard: { number: 'DEMO-MOHRE-77201', expiry: alreefExpiry },
        eSignatureCards: [
          { holder: 'Yousef Al Marzouqi', number: 'DEMO-ESIG-40117', expiry: d(140) },
          { holder: 'Sara Al Ali', number: 'DEMO-ESIG-40188', expiry: m(6) },
        ],
        proCard: { holder: 'Sara Al Ali', number: 'DEMO-GDRFA-PRO-3301', expiry: m(6) },
        portalRegistration: {
          portalName: 'GDRFA eChannels',
          reference: 'DEMO-ECH-220914',
          registeredOn: addDays(alreefIncorporated, 21),
        },
        chamberMembership: { number: 'DEMO-DCCI-88410', expiry: alreefExpiry },
        permits: [
          { name: 'Municipality trade permit', number: 'DEMO-DM-PRM-4410', expiry: d(275) },
        ],
      },
      tax: {
        corporateTax: {
          registered: true,
          registrationNumber: 'DEMO-CT-1000001',
          registeredOn: addMonths(alreefIncorporated, 2),
        },
        vat: {
          status: 'registered',
          trn: 'DEMO-TRN-100000001',
          periodEnd: alreefVatPeriodEnd,
          periodMonths: 3,
        },
        smallBusinessRelief: 'no',
        auditRequired: 'unknown',
        auditor: { name: 'DEMO Audit Partners', email: 'audit@example.com' },
      },
      visaCapacity: { allowed: 15, used: 12 },
      brand: { colourSlot: 0, logoDataUrl: null },
      banks: [
        {
          id: 'bk-alreef-1',
          bankName: 'Emirates NBD',
          kycRefreshOn: d(200),
          licenceSentOn: addDays(alreefIssued, 3),
          openedOn: addDays(alreefIncorporated, 35),
          signatories: ['Yousef Al Marzouqi', 'Mariam Al Falasi'],
          amendmentSentOn: addDays(alreefAmendedOn, 6),
        },
        {
          id: 'bk-alreef-2',
          bankName: 'Mashreq',
          kycRefreshOn: d(20),
          licenceSentOn: null,
          openedOn: m(-8),
          signatories: ['Yousef Al Marzouqi'],
          amendmentSentOn: null,
        },
      ],
      ubo: { declaredOn: addDays(alreefIncorporated, 30), lastOwnershipChangeOn: null },
      decision: null,
      answers: null,
      ownership: {
        shareholders: [
          { name: 'Yousef Al Marzouqi', nationality: 'Egypt', percentage: 60 },
          { name: 'Mariam Al Falasi', nationality: 'United Arab Emirates', percentage: 40 },
        ],
        ubos: [
          { name: 'Yousef Al Marzouqi', percentage: 60 },
          { name: 'Mariam Al Falasi', percentage: 40 },
        ],
        manager: 'Yousef Al Marzouqi',
        signatories: ['Yousef Al Marzouqi'],
        memorandumDate: alreefIncorporated,
      },
      // The PRO and the accountant are members (access grants), so no outside contacts.
      outsidePeople: { pro: null, accountant: null },
      status: { state: 'active' },
    },
    {
      id: DEMO_COMPANY_ID,
      identity: {
        tradeName: DEMO_COMPANY_NAME,
        legalForm: 'fze',
        authority: 'srtip',
        licenceNumber: 'DEMO-SRTIP-0417',
        issueDate: noorIssued,
        expiryDate: noorExpiry,
        activities: [
          {
            code: '6201',
            name: 'Computer programming activities',
            addedOn: noorIncorporated,
            removedOn: null,
            licenceVersion: { issuedOn: noorIncorporated, documentId: null },
          },
          // Added after the licence on file was issued: the amendment is still to be reflected.
          // The zone issued the amended licence the same day; its paper is not in the vault yet.
          {
            code: '7310',
            name: 'Advertising',
            addedOn: noorActivityAddedOn,
            removedOn: null,
            licenceVersion: { issuedOn: noorActivityAddedOn, documentId: null },
          },
        ],
        incorporationDate: noorIncorporated,
        financialYearEnd: '12-31',
        licenceCategory: 'Flexi-desk package',
        registeredOfficeId: 'of-demo-flexi',
        firstTaxPeriod: { start: noorIncorporated, end: nextYearEnd('12-31', noorIncorporated) },
        mohreClassification: null,
      },
      cards: {
        immigrationCard: { number: 'DEMO-ICP-88213', expiry: noorExpiry },
        mohreCard: null,
        eSignatureCards: [],
        proCard: null,
        portalRegistration: {
          portalName: 'SRTIP client portal',
          reference: 'DEMO-SRTIP-CP-0417',
          registeredOn: addDays(noorIncorporated, 3),
        },
        chamberMembership: null,
        permits: [],
      },
      tax: {
        corporateTax: {
          registered: true,
          registrationNumber: 'DEMO-CT-1000002',
          registeredOn: addMonths(noorIncorporated, 2),
        },
        // Not entered yet: the VAT registration card shows "unknown" and asks.
        vat: { status: 'unknown', trn: null },
        smallBusinessRelief: 'yes',
        auditRequired: 'unknown',
        auditor: null,
      },
      visaCapacity: { allowed: 2, used: 2 },
      brand: { colourSlot: 2, logoDataUrl: null },
      banks: [
        {
          id: 'bk-noor-1',
          bankName: 'Wio Bank',
          kycRefreshOn: null,
          licenceSentOn: addDays(noorIssued, 5),
          openedOn: addDays(noorIncorporated, 18),
          signatories: ['Tariq Mahmood', 'Amina Khan'],
          amendmentSentOn: null,
        },
      ],
      ubo: { declaredOn: addDays(noorIncorporated, 20), lastOwnershipChangeOn: null },
      decision: null,
      answers: null,
      ownership: {
        shareholders: [{ name: 'Tariq Mahmood', nationality: 'Pakistan', percentage: 100 }],
        ubos: [{ name: 'Tariq Mahmood', percentage: 100 }],
        manager: 'Amina Khan',
        signatories: ['Tariq Mahmood', 'Amina Khan'],
        memorandumDate: noorIncorporated,
      },
      outsidePeople: {
        pro: null,
        accountant: { name: 'Nadia Qureshi', email: 'nadia@example.com', phone: '+971500000101' },
      },
      status: { state: 'active' },
    },
    {
      id: MARASI_ID,
      identity: {
        tradeName: 'Marasi Commodities DMCC',
        legalForm: 'free-zone-llc',
        authority: 'dmcc',
        licenceNumber: 'DEMO-DMCC-31877',
        issueDate: marasiIssued,
        expiryDate: marasiExpiry,
        activities: [
          {
            code: '4662',
            name: 'Wholesale of metals and metal ores',
            addedOn: marasiIncorporated,
            removedOn: null,
            licenceVersion: { issuedOn: marasiIncorporated, documentId: null },
          },
        ],
        incorporationDate: marasiIncorporated,
        financialYearEnd: '12-31',
        licenceCategory: 'Trading licence',
        registeredOfficeId: 'of-marasi',
        firstTaxPeriod: {
          start: marasiIncorporated,
          end: nextYearEnd('12-31', marasiIncorporated),
        },
        mohreClassification: null,
      },
      cards: {
        immigrationCard: { number: 'DEMO-DMCC-IC-2201', expiry: d(400) },
        mohreCard: null,
        eSignatureCards: [],
        proCard: null,
        portalRegistration: {
          portalName: 'DMCC member portal',
          reference: 'DEMO-DMCC-MP-31877',
          registeredOn: addDays(marasiIncorporated, 2),
        },
        chamberMembership: null,
        permits: [],
      },
      tax: {
        corporateTax: {
          registered: true,
          registrationNumber: 'DEMO-CT-1000003',
          registeredOn: addMonths(marasiIncorporated, 1),
        },
        vat: {
          status: 'registered',
          trn: 'DEMO-TRN-100000003',
          periodEnd: marasiVatAnchor,
          periodMonths: 3,
        },
        smallBusinessRelief: 'no',
        // The owner answered yes (answers below) and the audited accounts are in the vault.
        auditRequired: 'yes',
        auditor: { name: 'DEMO Ledger and Co Auditors', email: 'audits@example.com' },
      },
      visaCapacity: { allowed: 5, used: 4 },
      brand: { colourSlot: 1, logoDataUrl: null },
      banks: [
        {
          id: 'bk-marasi-1',
          bankName: 'ADCB',
          kycRefreshOn: d(120),
          licenceSentOn: addDays(marasiIssued, 2),
          openedOn: addDays(marasiIncorporated, 25),
          signatories: ['Hessa Al Suwaidi'],
          amendmentSentOn: null,
        },
      ],
      ownership: {
        // A partner changed ten days ago (the history holds the amendment).
        shareholders: [
          { name: 'Hessa Al Suwaidi', nationality: 'Jordan', percentage: 50 },
          { name: 'Viktor Lind', nationality: 'Sweden', percentage: 50 },
        ],
        ubos: [
          { name: 'Hessa Al Suwaidi', percentage: 50 },
          { name: 'Viktor Lind', percentage: 50 },
        ],
        manager: 'Hessa Al Suwaidi',
        signatories: ['Hessa Al Suwaidi'],
        memorandumDate: marasiIncorporated,
      },
      outsidePeople: {
        pro: { name: 'Rami Khoury', email: 'rami.pro@example.com', phone: '+971500000202' },
        accountant: null,
      },
      status: { state: 'active' },
      // A partner changed ten days ago, after the declaration: the ownership change card is open.
      ubo: { declaredOn: addMonths(marasiIncorporated, 1), lastOwnershipChangeOn: d(-10) },
      decision: null,
      // The owner's answers, the third layer after her documents and the authority file.
      answers: [
        {
          questionId: 'auditRequiredForRenewal',
          answer: true,
          answeredOn: m(-1),
          source: 'owner-answer',
        },
        { questionId: 'ejariRequired', answer: false, answeredOn: m(-1), source: 'owner-answer' },
        {
          questionId: 'leaseMinimumRemainingDays',
          answer: 90,
          answeredOn: m(-1),
          source: 'owner-answer',
        },
        {
          questionId: 'renewalBundle',
          answer: 'licence, lease, establishment card',
          answeredOn: m(-1),
          source: 'owner-answer',
        },
      ],
    },
    {
      id: QASR_ID,
      identity: {
        tradeName: 'Qasr Al Bahr Consultancy',
        legalForm: 'sole-establishment',
        authority: 'abu-dhabi-mainland',
        licenceNumber: 'DEMO-ADDED-90311',
        issueDate: qasrIssued,
        expiryDate: qasrExpiry,
        activities: [
          {
            code: '7020',
            name: 'Management consultancy activities',
            addedOn: qasrIncorporated,
            removedOn: null,
            licenceVersion: { issuedOn: qasrIssued, documentId: 'do-qasr-licence' },
          },
        ],
        incorporationDate: qasrIncorporated,
        financialYearEnd: '12-31',
        licenceCategory: 'Professional licence',
        registeredOfficeId: 'of-qasr',
        // Not entered: the company is not registered for corporate tax yet, and the owner has not
        // entered its classification.
        firstTaxPeriod: null,
        mohreClassification: null,
      },
      // Most registrations not entered yet on this young company, so "Not entered" shows.
      cards: {
        immigrationCard: null,
        mohreCard: null,
        eSignatureCards: null,
        proCard: null,
        portalRegistration: null,
        chamberMembership: { number: 'DEMO-ADCCI-51022', expiry: qasrExpiry },
        permits: null,
      },
      tax: {
        corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
        vat: { status: 'not-registered', trn: null },
        smallBusinessRelief: 'unknown',
        auditRequired: 'unknown',
        auditor: null,
      },
      visaCapacity: { allowed: 2, used: 1 },
      brand: { colourSlot: 3, logoDataUrl: null },
      banks: [
        {
          id: 'bk-qasr-1',
          bankName: 'FAB',
          kycRefreshOn: d(300),
          licenceSentOn: addDays(qasrIssued, 10),
          openedOn: null,
          signatories: null,
          amendmentSentOn: null,
        },
      ],
      ubo: { declaredOn: addDays(qasrIncorporated, 25), lastOwnershipChangeOn: null },
      decision: null,
      answers: null,
      ownership: {
        shareholders: [
          { name: 'Khalifa Al Dhaheri', nationality: 'United Arab Emirates', percentage: 100 },
        ],
        ubos: [{ name: 'Khalifa Al Dhaheri', percentage: 100 }],
        manager: null,
        signatories: null,
        memorandumDate: null,
      },
      outsidePeople: {
        pro: { name: 'Hamad Al Nuaimi', email: null, phone: '+971500000303' },
        accountant: null,
      },
      status: { state: 'active' },
    },
    {
      id: HAMDAN_ID,
      identity: {
        tradeName: 'Hamdan Logistics FZCO',
        legalForm: 'fzco',
        authority: 'jafza',
        licenceNumber: 'DEMO-JAFZA-14502',
        issueDate: hamdanIssued,
        expiryDate: hamdanExpiry,
        activities: [
          {
            code: '5210',
            name: 'Warehousing and storage',
            addedOn: hamdanIncorporated,
            removedOn: null,
            licenceVersion: { issuedOn: hamdanIncorporated, documentId: null },
          },
          {
            code: '5229',
            name: 'Other transportation support activities',
            addedOn: hamdanIncorporated,
            removedOn: null,
            // Not entered.
            licenceVersion: null,
          },
        ],
        incorporationDate: hamdanIncorporated,
        financialYearEnd: '12-31',
        // Not entered: the owner has not typed the package name.
        licenceCategory: null,
        registeredOfficeId: 'of-hamdan',
        firstTaxPeriod: {
          start: hamdanIncorporated,
          end: nextYearEnd('12-31', hamdanIncorporated),
        },
        mohreClassification: null,
      },
      cards: {
        immigrationCard: { number: 'DEMO-JAFZA-IC-8810', expiry: d(80) },
        mohreCard: null,
        eSignatureCards: [],
        proCard: null,
        portalRegistration: {
          portalName: 'JAFZA online portal',
          reference: null,
          registeredOn: null,
        },
        chamberMembership: null,
        permits: [
          { name: 'Customs client registration', number: 'DEMO-CUS-77102', expiry: d(210) },
        ],
      },
      tax: {
        corporateTax: {
          registered: true,
          registrationNumber: 'DEMO-CT-1000005',
          registeredOn: addMonths(hamdanIncorporated, 2),
        },
        vat: { status: 'not-registered', trn: null },
        smallBusinessRelief: 'unknown',
        auditRequired: 'unknown',
        auditor: null,
      },
      visaCapacity: { allowed: 10, used: 8 },
      brand: { colourSlot: 4, logoDataUrl: null },
      banks: [
        {
          id: 'bk-hamdan-1',
          bankName: 'RAKBANK',
          kycRefreshOn: d(60),
          licenceSentOn: addDays(hamdanIssued, 7),
          openedOn: addDays(hamdanIncorporated, 40),
          signatories: ['Ravi Iyer'],
          amendmentSentOn: null,
        },
      ],
      // Not entered: the UBO declaration card shows "unknown".
      ubo: null,
      decision: null,
      answers: null,
      ownership: {
        shareholders: [
          { name: 'Hamdan Al Ketbi', nationality: 'United Arab Emirates', percentage: 70 },
          { name: 'Ravi Iyer', nationality: 'India', percentage: 30 },
        ],
        // Not entered, like the UBO filing date.
        ubos: null,
        manager: 'Ravi Iyer',
        signatories: ['Ravi Iyer'],
        memorandumDate: hamdanIncorporated,
      },
      outsidePeople: {
        pro: { name: 'Joseph Pinto', email: 'joseph.pro@example.com', phone: '+971500000404' },
        // The accountant is a member (Faisal Rahman), so no outside accountant.
        accountant: null,
      },
      status: { state: 'active' },
    },
    {
      id: SHARED_COMPANY_ID,
      identity: {
        tradeName: 'Sahara Ventures FZE',
        legalForm: 'fze',
        authority: 'srtip',
        licenceNumber: 'DEMO-SRTIP-0102',
        issueDate: saharaIssued,
        expiryDate: saharaExpiry,
        activities: [
          {
            code: '7410',
            name: 'Specialised design activities',
            addedOn: saharaIncorporated,
            removedOn: null,
            licenceVersion: { issuedOn: saharaIncorporated, documentId: null },
          },
        ],
        incorporationDate: saharaIncorporated,
        financialYearEnd: '12-31',
        licenceCategory: 'Flexi-desk package',
        registeredOfficeId: 'of-sahara',
        firstTaxPeriod: {
          start: saharaIncorporated,
          end: nextYearEnd('12-31', saharaIncorporated),
        },
        mohreClassification: null,
      },
      cards: {
        immigrationCard: { number: 'DEMO-ICP-30115', expiry: saharaExpiry },
        mohreCard: null,
        eSignatureCards: [],
        proCard: null,
        portalRegistration: {
          portalName: 'SRTIP client portal',
          reference: 'DEMO-SRTIP-CP-0102',
          registeredOn: addDays(saharaIncorporated, 4),
        },
        chamberMembership: null,
        permits: [],
      },
      tax: {
        corporateTax: {
          registered: true,
          registrationNumber: 'DEMO-CT-1000006',
          registeredOn: addMonths(saharaIncorporated, 2),
        },
        vat: { status: 'not-registered', trn: null },
        smallBusinessRelief: 'yes',
        auditRequired: 'unknown',
        auditor: null,
      },
      visaCapacity: { allowed: 1, used: 1 },
      brand: { colourSlot: 5, logoDataUrl: null },
      banks: [
        {
          id: 'bk-sahara-1',
          bankName: 'Wio Bank',
          kycRefreshOn: d(150),
          licenceSentOn: addDays(saharaIssued, 4),
          openedOn: addDays(saharaIncorporated, 15),
          signatories: ['Khalid Mansoor'],
          amendmentSentOn: null,
        },
      ],
      ubo: { declaredOn: addDays(saharaIncorporated, 40), lastOwnershipChangeOn: null },
      decision: { forExpiry: saharaExpiry, answer: 'cancel', thinkingOfClosing: null },
      answers: null,
      ownership: {
        shareholders: [{ name: 'Khalid Mansoor', nationality: 'Saudi Arabia', percentage: 100 }],
        ubos: [{ name: 'Khalid Mansoor', percentage: 100 }],
        manager: 'Khalid Mansoor',
        signatories: ['Khalid Mansoor'],
        memorandumDate: saharaIncorporated,
      },
      outsidePeople: {
        pro: null,
        accountant: { name: 'Omar Farouk', email: 'omar.farouk@example.com', phone: null },
      },
      // Closing is under way; the company stays active until the cancellation certificate.
      status: { state: 'active' },
    },
  ];

  const noServices: Office['services'] = {
    electricityAndWaterAccount: null,
    telecomAccount: null,
    buildingAccess: null,
    parking: null,
  };

  const offices: Office[] = [
    {
      id: 'of-alreef',
      companyId: ALREEF_ID,
      premises: {
        type: 'dedicated-office',
        address: 'Office 1204, Bay Square, Business Bay, Dubai',
        sizeSqm: 140,
        servesActivityCodes: ['4620', '4711'],
        isRegisteredAddress: true,
      },
      lease: {
        landlord: 'Bay Square Properties',
        start: d(-90),
        end: d(275),
        noticePeriodDays: 90,
        rentAed: 120000,
        securityDepositAed: 10000,
        paymentSchedule: [
          { dueOn: d(-60), amountAed: 30000, method: 'cheque' },
          { dueOn: d(30), amountAed: 30000, method: 'cheque' },
          { dueOn: d(120), amountAed: 30000, method: 'cheque' },
          { dueOn: d(210), amountAed: 30000, method: 'cheque' },
        ],
        ejari: { number: 'DEMO-EJARI-501', expiry: d(275) },
        tenancyContractDocumentId: 'do-alreef-lease',
      },
      approvals: [
        { type: 'civil-defence-approval', reference: 'DEMO-DCD-77', expiry: d(300) },
        { type: 'signboard-permit', reference: 'DEMO-SIGN-12', expiry: d(275) },
      ],
      services: {
        electricityAndWaterAccount: 'DEMO-DEWA-2001',
        telecomAccount: 'DEMO-DU-3001',
        buildingAccess: 'Card 12 and 13',
        parking: 'Bay 2, P2',
      },
      capacity: { quotaAllowed: 15, quotaUsed: 12 },
    },
    {
      id: 'of-demo-flexi',
      companyId: DEMO_COMPANY_ID,
      premises: {
        type: 'flexi-desk',
        address: 'SRTIP, University City, Sharjah',
        sizeSqm: null,
        servesActivityCodes: ['6201', '7310'],
        isRegisteredAddress: true,
      },
      lease: {
        landlord: 'SRTIP',
        start: noorIssued,
        end: noorExpiry,
        noticePeriodDays: 30,
        rentAed: null,
        securityDepositAed: null,
        paymentSchedule: [],
        ejari: null,
        tenancyContractDocumentId: 'do-demo-lease',
      },
      approvals: [],
      services: noServices,
      capacity: { quotaAllowed: 2, quotaUsed: 2 },
    },
    {
      id: 'of-marasi',
      companyId: MARASI_ID,
      premises: {
        type: 'serviced-office',
        address: 'Unit 8, Almas Tower, JLT, Dubai',
        sizeSqm: 45,
        servesActivityCodes: ['4662'],
        isRegisteredAddress: true,
      },
      lease: {
        landlord: 'DMCC',
        start: d(-35),
        end: d(330),
        noticePeriodDays: 60,
        rentAed: 64000,
        securityDepositAed: 5000,
        paymentSchedule: [
          { dueOn: d(45), amountAed: 32000, method: 'transfer' },
          { dueOn: d(225), amountAed: 32000, method: 'transfer' },
        ],
        ejari: null,
        tenancyContractDocumentId: 'do-marasi-lease',
      },
      approvals: [],
      services: {
        ...noServices,
        electricityAndWaterAccount: 'Included',
        telecomAccount: 'DEMO-ETI-4410',
      },
      capacity: { quotaAllowed: 5, quotaUsed: 4 },
    },
    {
      id: 'of-qasr',
      companyId: QASR_ID,
      premises: {
        type: 'shop',
        address: 'Shop 3, Al Bateen Street, Abu Dhabi',
        sizeSqm: 60,
        servesActivityCodes: ['7020'],
        isRegisteredAddress: true,
      },
      lease: {
        landlord: 'Al Bateen Real Estate',
        start: d(-165),
        end: d(200),
        noticePeriodDays: 60,
        rentAed: 48000,
        securityDepositAed: 4000,
        paymentSchedule: [{ dueOn: d(15), amountAed: 24000, method: 'cheque' }],
        ejari: null,
        tenancyContractDocumentId: 'do-qasr-lease',
      },
      approvals: [],
      services: { ...noServices, electricityAndWaterAccount: 'DEMO-ADDC-9001' },
      capacity: { quotaAllowed: 2, quotaUsed: 1 },
    },
    {
      id: 'of-hamdan',
      companyId: HAMDAN_ID,
      premises: {
        type: 'warehouse',
        address: 'Warehouse FZS1-AB07, Jebel Ali Free Zone, Dubai',
        sizeSqm: 900,
        servesActivityCodes: ['5210', '5229'],
        isRegisteredAddress: true,
      },
      lease: {
        landlord: 'JAFZA',
        start: d(-65),
        end: d(300),
        noticePeriodDays: 90,
        rentAed: 210000,
        securityDepositAed: 20000,
        paymentSchedule: [{ dueOn: d(90), amountAed: 105000, method: 'transfer' }],
        ejari: null,
        tenancyContractDocumentId: 'do-hamdan-lease',
      },
      approvals: [{ type: 'civil-defence-approval', reference: 'DEMO-DCD-301', expiry: d(180) }],
      services: {
        electricityAndWaterAccount: 'DEMO-DEWA-7770',
        telecomAccount: 'DEMO-DU-7771',
        buildingAccess: 'Gate 4',
        parking: 'Yard',
      },
      capacity: { quotaAllowed: 10, quotaUsed: 8 },
    },
    {
      id: 'of-sahara',
      companyId: SHARED_COMPANY_ID,
      premises: {
        type: 'flexi-desk',
        address: 'SRTIP, University City, Sharjah',
        sizeSqm: null,
        servesActivityCodes: ['7410'],
        isRegisteredAddress: true,
      },
      lease: {
        landlord: 'SRTIP',
        start: saharaIssued,
        end: saharaExpiry,
        noticePeriodDays: 30,
        rentAed: null,
        securityDepositAed: null,
        paymentSchedule: [],
        ejari: null,
        tenancyContractDocumentId: null,
      },
      approvals: [],
      services: noServices,
      capacity: { quotaAllowed: 1, quotaUsed: 1 },
    },
  ];

  // The ten stages of spec 6.2 across the companies, in the order of the chain.
  const people: Person[] = [
    // Al Reef: a partner, ten employees, one dependant sponsored by an employee.
    person({
      id: 'pe-alreef-partner',
      companyId: ALREEF_ID,
      name: 'Yousef Al Marzouqi',
      nationality: 'Egypt',
      passport: 'DEMO-P-0001',
      passportExpiry: m(60),
      role: 'Partner and manager',
      emirate: 'Dubai',
      type: 'partner',
      stage: 'residence-visa',
      entryDate: m(-36),
      visaExpiry: m(14),
      emiratesIdExpiry: m(14),
      insuranceEnd: m(9),
      email: 'yousef@example.com',
    }),
    person({
      id: 'pe-alreef-01',
      companyId: ALREEF_ID,
      name: 'Maria Santos',
      nationality: 'Philippines',
      passport: 'DEMO-P-0002',
      passportExpiry: m(48),
      role: 'Sales executive',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'work-permit',
      entryDate: m(-20),
      visaExpiry: m(4),
      emiratesIdExpiry: m(4),
      workPermitExpiry: m(4),
      contractStart: m(-19),
      insuranceEnd: m(5),
      unemploymentUntil: m(8),
      underWps: true,
      email: 'maria@example.com',
    }),
    // The blocker: the passport runs out before the six months the renewal needs.
    person({
      id: 'pe-alreef-02',
      companyId: ALREEF_ID,
      name: 'Rahul Menon',
      nationality: 'India',
      passport: 'DEMO-P-0003',
      passportExpiry: d(100),
      role: 'Accountant',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'work-permit',
      entryDate: m(-19),
      visaExpiry: d(150),
      emiratesIdExpiry: d(150),
      workPermitExpiry: d(150),
      contractStart: m(-18),
      insuranceEnd: m(10),
      unemploymentUntil: m(6),
      underWps: true,
      email: 'rahul@example.com',
    }),
    // Leaving: the contract ends in forty days.
    person({
      id: 'pe-alreef-03',
      companyId: ALREEF_ID,
      name: 'Grace Okafor',
      nationality: 'Nigeria',
      passport: 'DEMO-P-0004',
      passportExpiry: m(70),
      role: 'Store supervisor',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'work-permit',
      entryDate: m(-15),
      visaExpiry: m(9),
      emiratesIdExpiry: m(9),
      workPermitExpiry: m(9),
      contractStart: m(-14),
      contractEnd: d(40),
      insuranceEnd: m(9),
      unemploymentUntil: m(9),
      underWps: true,
    }),
    person({
      id: 'pe-alreef-04',
      companyId: ALREEF_ID,
      name: 'Tariq Aziz',
      nationality: 'Pakistan',
      passport: 'DEMO-P-0005',
      passportExpiry: m(30),
      role: 'Driver',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'work-permit',
      entryDate: m(-11),
      visaExpiry: m(13),
      emiratesIdExpiry: m(13),
      workPermitExpiry: m(13),
      contractStart: m(-10),
      insuranceEnd: d(25),
      unemploymentUntil: m(11),
      underWps: true,
    }),
    person({
      id: 'pe-alreef-05',
      companyId: ALREEF_ID,
      name: 'Lena Petrova',
      nationality: 'Russia',
      passport: 'DEMO-P-0006',
      passportExpiry: m(90),
      role: 'Marketing manager',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'work-permit',
      entryDate: m(-8),
      visaExpiry: m(16),
      emiratesIdExpiry: m(16),
      workPermitExpiry: m(16),
      contractStart: m(-7),
      insuranceEnd: m(16),
      unemploymentUntil: m(15),
      underWps: true,
      email: 'lena@example.com',
    }),
    person({
      id: 'pe-alreef-06',
      companyId: ALREEF_ID,
      name: 'Ahmed Saleh',
      nationality: 'Sudan',
      passport: 'DEMO-P-0007',
      passportExpiry: m(40),
      role: 'Warehouse hand',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: d(-10),
      visaExpiry: m(24),
      emiratesIdExpiry: m(24),
      insuranceEnd: m(12),
      unemploymentUntil: null,
    }),
    person({
      id: 'pe-alreef-07',
      companyId: ALREEF_ID,
      name: 'Priya Nair',
      nationality: 'India',
      passport: 'DEMO-P-0008',
      passportExpiry: m(55),
      role: 'Cashier',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'residence-visa',
      entryPermitIssuedOn: d(-45),
      entryDate: d(-30),
      contractStart: d(-20),
      insuranceEnd: m(12),
      unemploymentUntil: m(24),
      assigneeId: 'ag-demo-pro',
    }),
    person({
      id: 'pe-alreef-08',
      companyId: ALREEF_ID,
      name: 'Samuel Adeyemi',
      nationality: 'Ghana',
      passport: 'DEMO-P-0009',
      passportExpiry: m(66),
      role: 'Sales executive',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'emirates-id',
      entryPermitIssuedOn: d(-55),
      entryDate: d(-40),
      contractStart: d(-30),
      insuranceEnd: m(12),
      unemploymentUntil: m(24),
      assigneeId: 'ag-demo-pro',
    }),
    person({
      id: 'pe-alreef-09',
      companyId: ALREEF_ID,
      name: 'Noura Haddad',
      nationality: 'Lebanon',
      passport: 'DEMO-P-0010',
      passportExpiry: m(80),
      role: 'Buyer',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'medical',
      entryPermitIssuedOn: d(-31),
      // Entered sixteen days ago with no contract registered: two days late on the mainland.
      entryDate: d(-16),
      insuranceEnd: m(12),
      unemploymentUntil: null,
      assigneeId: 'ag-demo-pro',
    }),
    person({
      id: 'pe-alreef-10',
      companyId: ALREEF_ID,
      name: 'Daniel Reyes',
      nationality: 'Philippines',
      passport: 'DEMO-P-0011',
      passportExpiry: m(72),
      role: 'Driver',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'health-insurance',
      entryPermitIssuedOn: d(-20),
      entryDate: d(-5),
      unemploymentUntil: null,
    }),
    person({
      id: 'pe-alreef-dep',
      companyId: ALREEF_ID,
      name: 'Isabel Santos',
      nationality: 'Philippines',
      passport: 'DEMO-P-0012',
      passportExpiry: m(50),
      role: 'Dependant of Maria Santos',
      emirate: 'Dubai',
      type: 'dependant',
      sponsor: { kind: 'employee', personId: 'pe-alreef-01' },
      stage: 'residence-visa',
      entryDate: m(-18),
      visaExpiry: m(4),
      emiratesIdExpiry: m(4),
      insuranceEnd: m(5),
    }),

    // Noor Digital: the general manager with a complete chain, a developer on an entry permit.
    person({
      id: 'pe-demo-amina',
      companyId: DEMO_COMPANY_ID,
      name: 'Amina Khan',
      nationality: 'Pakistan',
      passport: 'DEMO-P-0101',
      passportExpiry: m(64),
      role: 'General manager',
      emirate: 'Sharjah',
      type: 'employee',
      stage: 'residence-visa',
      entryPermitIssuedOn: m(-22),
      entryDate: m(-22),
      visaExpiry: m(14),
      emiratesIdExpiry: m(14),
      contractStart: m(-21),
      insuranceEnd: m(14),
      email: 'amina@example.com',
    }),
    person({
      id: 'pe-demo-omar',
      companyId: DEMO_COMPANY_ID,
      name: 'Omar Haddad',
      nationality: 'Jordan',
      passport: 'DEMO-P-0102',
      passportExpiry: m(58),
      role: 'Software developer',
      emirate: 'Sharjah',
      type: 'employee',
      stage: 'entry-permit',
      entryPermitIssuedOn: d(-12),
      assigneeId: 'ag-demo-pro',
    }),

    // Marasi: a partner, an employee with a complete chain, one at each of the first stages.
    person({
      id: 'pe-marasi-partner',
      companyId: MARASI_ID,
      name: 'Hessa Al Suwaidi',
      nationality: 'Jordan',
      passport: 'DEMO-P-0201',
      passportExpiry: m(84),
      role: 'Partner',
      emirate: 'Dubai',
      type: 'partner',
      stage: 'residence-visa',
      entryDate: m(-27),
      visaExpiry: m(16),
      emiratesIdExpiry: m(16),
      insuranceEnd: m(10),
      email: 'hessa@example.com',
    }),
    person({
      id: 'pe-marasi-01',
      companyId: MARASI_ID,
      name: 'Chen Wei',
      nationality: 'China',
      passport: 'DEMO-P-0202',
      passportExpiry: m(44),
      role: 'Trader',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: m(-14),
      visaExpiry: m(10),
      emiratesIdExpiry: m(10),
      contractStart: m(-13),
      insuranceEnd: m(10),
      underWps: true,
    }),
    person({
      id: 'pe-marasi-02',
      companyId: MARASI_ID,
      name: 'Fatima Zahra',
      nationality: 'Morocco',
      passport: 'DEMO-P-0203',
      passportExpiry: m(70),
      role: 'Operations manager',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'entry',
      entryPermitIssuedOn: d(-30),
      entryDate: d(-15),
      insuranceEnd: m(12),
    }),
    person({
      id: 'pe-marasi-03',
      companyId: MARASI_ID,
      name: 'Jonas Berg',
      nationality: 'Sweden',
      passport: 'DEMO-P-0204',
      passportExpiry: m(92),
      role: 'Analyst',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'offer-letter',
    }),
    person({
      id: 'pe-marasi-04',
      companyId: MARASI_ID,
      name: 'Aisha Bello',
      nationality: 'Nigeria',
      passport: 'DEMO-P-0205',
      passportExpiry: m(36),
      role: 'Office administrator',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'quota-check',
    }),

    // Qasr Al Bahr: one employee with a complete mainland chain.
    person({
      id: 'pe-qasr-01',
      companyId: QASR_ID,
      name: 'Karim Fares',
      nationality: 'Syria',
      passport: 'DEMO-P-0301',
      passportExpiry: m(75),
      role: 'Consultant',
      emirate: 'Abu Dhabi',
      type: 'employee',
      stage: 'work-permit',
      entryDate: m(-4),
      visaExpiry: m(20),
      emiratesIdExpiry: m(20),
      workPermitExpiry: m(20),
      contractStart: m(-3),
      insuranceEnd: m(20),
      unemploymentUntil: m(8),
      underWps: true,
      email: 'karim@example.com',
    }),

    // Hamdan: six complete chains, one on an entry permit, one at the Emirates ID stage.
    person({
      id: 'pe-hamdan-01',
      companyId: HAMDAN_ID,
      name: 'Suresh Kumar',
      nationality: 'India',
      passport: 'DEMO-P-0401',
      passportExpiry: m(38),
      role: 'Warehouse manager',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: m(-40),
      visaExpiry: d(12),
      emiratesIdExpiry: d(12),
      contractStart: m(-39),
      insuranceEnd: m(11),
      underWps: true,
      email: 'suresh@example.com',
    }),
    person({
      id: 'pe-hamdan-02',
      companyId: HAMDAN_ID,
      name: 'Joseph Mwangi',
      nationality: 'Kenya',
      passport: 'DEMO-P-0402',
      passportExpiry: m(52),
      role: 'Forklift operator',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: m(-30),
      visaExpiry: m(6),
      emiratesIdExpiry: m(6),
      contractStart: m(-29),
      insuranceEnd: m(6),
      underWps: true,
    }),
    person({
      id: 'pe-hamdan-03',
      companyId: HAMDAN_ID,
      name: 'Mohammed Irfan',
      nationality: 'Bangladesh',
      passport: 'DEMO-P-0403',
      passportExpiry: m(61),
      role: 'Loader',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: m(-26),
      visaExpiry: m(2),
      emiratesIdExpiry: m(2),
      contractStart: m(-25),
      insuranceEnd: m(8),
      underWps: true,
    }),
    person({
      id: 'pe-hamdan-04',
      companyId: HAMDAN_ID,
      name: 'Elena Ionescu',
      nationality: 'Romania',
      passport: 'DEMO-P-0404',
      passportExpiry: m(88),
      role: 'Logistics coordinator',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: m(-22),
      visaExpiry: m(14),
      emiratesIdExpiry: m(14),
      contractStart: m(-21),
      insuranceEnd: m(14),
      underWps: true,
      email: 'elena@example.com',
    }),
    person({
      id: 'pe-hamdan-05',
      companyId: HAMDAN_ID,
      name: 'Bilal Hussain',
      nationality: 'Pakistan',
      passport: 'DEMO-P-0405',
      passportExpiry: m(33),
      role: 'Driver',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: m(-18),
      visaExpiry: m(18),
      emiratesIdExpiry: m(18),
      contractStart: m(-17),
      insuranceEnd: m(18),
      underWps: true,
    }),
    person({
      id: 'pe-hamdan-06',
      companyId: HAMDAN_ID,
      name: 'Rosa Delgado',
      nationality: 'Colombia',
      passport: 'DEMO-P-0406',
      passportExpiry: m(77),
      role: 'Customs clerk',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: m(-9),
      visaExpiry: m(27),
      emiratesIdExpiry: m(27),
      contractStart: m(-8),
      insuranceEnd: m(15),
      underWps: true,
    }),
    person({
      id: 'pe-hamdan-07',
      companyId: HAMDAN_ID,
      name: 'Peter Okoye',
      nationality: 'Nigeria',
      passport: 'DEMO-P-0407',
      passportExpiry: m(46),
      role: 'Loader',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'entry-permit',
      entryPermitIssuedOn: d(-8),
      insuranceEnd: m(24),
    }),
    person({
      id: 'pe-hamdan-08',
      companyId: HAMDAN_ID,
      name: 'Anjali Sharma',
      nationality: 'India',
      passport: 'DEMO-P-0408',
      passportExpiry: m(69),
      role: 'Accounts assistant',
      emirate: 'Dubai',
      type: 'employee',
      stage: 'emirates-id',
      entryPermitIssuedOn: d(-65),
      entryDate: d(-50),
      insuranceEnd: m(24),
    }),

    // Sahara: one employee, whose visa the cancellation will release.
    person({
      id: 'pe-sahara-01',
      companyId: SHARED_COMPANY_ID,
      name: 'Layan Nasser',
      nationality: 'Jordan',
      passport: 'DEMO-P-0501',
      passportExpiry: m(41),
      role: 'Designer',
      emirate: 'Sharjah',
      type: 'employee',
      stage: 'labour-contract',
      entryDate: m(-28),
      visaExpiry: m(20),
      emiratesIdExpiry: m(20),
      contractStart: m(-27),
      insuranceEnd: m(20),
    }),
  ];

  const noorAgreedOn = addDays(noorIssued, 3);
  const alreefVatPrevious = addDays(addMonths(alreefVatPeriodEnd, -3), 20);

  // Every document type of spec 5.3 appears at least once. Titles say what the paper is.
  const documents: Document[] = [
    // Al Reef, company papers.
    document({
      id: 'do-alreef-licence',
      companyId: ALREEF_ID,
      type: 'licence',
      title: 'Trade licence, current year',
      issueDate: alreefIssued,
      expiryDate: alreefExpiry,
      uploadedOn: addDays(alreefIssued, 1),
    }),
    document({
      id: 'do-alreef-amended',
      companyId: ALREEF_ID,
      type: 'amended-licence',
      title: 'Amended licence, retail activity added',
      issueDate: addMonths(alreefIssued, -14),
      expiryDate: alreefIssued,
      uploadedOn: addMonths(alreefIssued, -14),
    }),
    document({
      id: 'do-alreef-moa',
      companyId: ALREEF_ID,
      type: 'memorandum',
      title: 'Memorandum of association',
      issueDate: alreefIncorporated,
      uploadedOn: addDays(alreefIncorporated, 5),
    }),
    document({
      id: 'do-alreef-estcard',
      companyId: ALREEF_ID,
      type: 'establishment-card',
      title: 'Immigration establishment card',
      issueDate: alreefIssued,
      expiryDate: alreefExpiry,
      uploadedOn: addDays(alreefIssued, 4),
    }),
    document({
      id: 'do-alreef-esig',
      companyId: ALREEF_ID,
      type: 'e-signature-card',
      title: 'MOHRE e-signature card, Yousef Al Marzouqi',
      issueDate: alreefIssued,
      expiryDate: d(140),
      uploadedOn: addDays(alreefIssued, 4),
    }),
    document({
      id: 'do-alreef-procard',
      companyId: ALREEF_ID,
      type: 'pro-card',
      title: 'PRO card, Sara Al Ali',
      issueDate: m(-6),
      expiryDate: m(6),
      uploadedOn: m(-6),
    }),
    document({
      id: 'do-alreef-proletter',
      companyId: ALREEF_ID,
      type: 'pro-authorisation-letter',
      title: 'PRO authorisation letter',
      issueDate: m(-6),
      uploadedOn: m(-6),
    }),
    document({
      id: 'do-alreef-chamber',
      companyId: ALREEF_ID,
      type: 'chamber-certificate',
      title: 'Dubai Chamber membership certificate',
      issueDate: alreefIssued,
      expiryDate: alreefExpiry,
      uploadedOn: addDays(alreefIssued, 12),
    }),
    document({
      id: 'do-alreef-lease',
      companyId: ALREEF_ID,
      officeId: 'of-alreef',
      type: 'lease',
      title: 'Tenancy contract, Bay Square',
      issueDate: d(-90),
      expiryDate: d(275),
      uploadedOn: d(-88),
    }),
    document({
      id: 'do-alreef-ejari',
      companyId: ALREEF_ID,
      officeId: 'of-alreef',
      type: 'ejari-certificate',
      title: 'Ejari certificate',
      issueDate: d(-88),
      expiryDate: d(275),
      uploadedOn: d(-87),
    }),
    document({
      id: 'do-alreef-fitout',
      companyId: ALREEF_ID,
      officeId: 'of-alreef',
      type: 'fit-out-permit',
      title: 'Fit-out permit',
      issueDate: d(-85),
      expiryDate: d(-25),
      uploadedOn: d(-85),
    }),
    document({
      id: 'do-alreef-dcd',
      companyId: ALREEF_ID,
      officeId: 'of-alreef',
      type: 'civil-defence-permit',
      title: 'Civil defence approval',
      issueDate: d(-65),
      expiryDate: d(300),
      uploadedOn: d(-64),
    }),
    document({
      id: 'do-alreef-sign',
      companyId: ALREEF_ID,
      officeId: 'of-alreef',
      type: 'signboard-permit',
      title: 'Signboard permit',
      issueDate: d(-60),
      expiryDate: d(275),
      uploadedOn: d(-59),
    }),
    document({
      id: 'do-alreef-rent-receipt',
      companyId: ALREEF_ID,
      officeId: 'of-alreef',
      type: 'deposit-receipt',
      title: 'Rent cheque receipt, first instalment',
      issueDate: d(-60),
      uploadedOn: d(-59),
    }),
    document({
      id: 'do-alreef-taxcert',
      companyId: ALREEF_ID,
      type: 'tax-certificate',
      title: 'Corporate tax registration certificate',
      issueDate: addMonths(alreefIncorporated, 2),
      uploadedOn: addMonths(alreefIncorporated, 2),
    }),
    document({
      id: 'do-alreef-vatreturn',
      companyId: ALREEF_ID,
      type: 'vat-return',
      title: 'VAT return, previous period',
      issueDate: alreefVatPrevious,
      uploadedOn: alreefVatPrevious,
    }),
    document({
      id: 'do-alreef-ctreturn',
      companyId: ALREEF_ID,
      type: 'corporate-tax-return',
      title: 'Corporate tax return, last financial year',
      issueDate: d(-14),
      uploadedOn: d(-14),
    }),
    document({
      id: 'do-alreef-taxreceipt',
      companyId: ALREEF_ID,
      type: 'tax-receipt',
      title: 'Corporate tax payment receipt',
      issueDate: d(-14),
      uploadedOn: d(-14),
    }),
    document({
      id: 'do-alreef-ubo',
      companyId: ALREEF_ID,
      type: 'ubo-declaration',
      title: 'UBO declaration',
      issueDate: addDays(alreefIncorporated, 30),
      uploadedOn: addDays(alreefIncorporated, 31),
    }),
    document({
      id: 'do-alreef-policy',
      companyId: ALREEF_ID,
      type: 'insurance-policy',
      title: 'Group health insurance policy',
      issueDate: m(-7),
      expiryDate: m(5),
      uploadedOn: m(-7),
      // The insurer reissued the policy a month after the first issue; the first issue is kept
      // as version 1 (spec 5.3).
      version: 2,
      previousVersions: [
        {
          version: 1,
          title: 'Group health insurance policy',
          fileName: 'do-alreef-policy-v1.pdf',
          issueDate: m(-8),
          expiryDate: m(4),
          uploadedOn: m(-8),
          replacedOn: m(-7),
        },
      ],
    }),
    document({
      id: 'do-alreef-bankletter',
      companyId: ALREEF_ID,
      type: 'bank-letter',
      title: 'Bank letter, Emirates NBD',
      issueDate: addDays(alreefIssued, 3),
      uploadedOn: addDays(alreefIssued, 3),
    }),
    document({
      id: 'do-alreef-wages',
      companyId: ALREEF_ID,
      type: 'wages-file',
      title: 'WPS wages file, last month',
      issueDate: thisPayDay,
      uploadedOn: thisPayDay,
    }),
    document({
      id: 'do-alreef-signatory',
      companyId: ALREEF_ID,
      type: 'signatory-letter',
      title: 'Authorised signatory letter',
      issueDate: alreefIncorporated,
      uploadedOn: addDays(alreefIncorporated, 6),
    }),
    document({
      id: 'do-alreef-resolution',
      companyId: ALREEF_ID,
      type: 'board-resolution',
      title: 'Partner resolution, general assembly',
      issueDate: addMonths(alreefYearEnd, 3),
      uploadedOn: addMonths(alreefYearEnd, 3),
    }),
    // Al Reef, people papers.
    document({
      id: 'do-alreef-passport-maria',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-01',
      type: 'passport',
      title: 'Passport, Maria Santos',
      expiryDate: m(48),
      uploadedOn: m(-20),
    }),
    document({
      id: 'do-alreef-permit-priya',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-07',
      type: 'entry-permit',
      title: 'Entry permit, Priya Nair',
      issueDate: d(-45),
      expiryDate: addMonths(d(-45), 2),
      uploadedOn: d(-45),
    }),
    document({
      id: 'do-alreef-visa-maria',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-01',
      type: 'visa',
      title: 'Residence visa, Maria Santos',
      expiryDate: m(4),
      uploadedOn: m(-20),
    }),
    document({
      id: 'do-alreef-eid-maria',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-01',
      type: 'emirates-id',
      title: 'Emirates ID, Maria Santos',
      expiryDate: m(4),
      uploadedOn: m(-19),
    }),
    document({
      id: 'do-alreef-wp-maria',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-01',
      type: 'work-permit',
      title: 'Work permit, Maria Santos',
      expiryDate: m(4),
      uploadedOn: m(-19),
    }),
    document({
      id: 'do-alreef-contract-maria',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-01',
      type: 'labour-contract',
      title: 'Labour contract, Maria Santos',
      issueDate: m(-19),
      uploadedOn: m(-19),
    }),
    document({
      id: 'do-alreef-offer-daniel',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-10',
      type: 'offer-letter',
      title: 'Job offer, Daniel Reyes',
      issueDate: d(-30),
      uploadedOn: d(-30),
    }),
    document({
      id: 'do-alreef-medical-noura',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-09',
      type: 'medical-result',
      title: 'Medical fitness result, Noura Haddad',
      issueDate: d(-6),
      uploadedOn: d(-6),
    }),
    document({
      id: 'do-alreef-iloe-maria',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-01',
      type: 'unemployment-insurance-certificate',
      title: 'Unemployment insurance certificate, Maria Santos',
      expiryDate: m(8),
      uploadedOn: m(-4),
    }),
    document({
      id: 'do-alreef-inscert-maria',
      companyId: ALREEF_ID,
      personId: 'pe-alreef-01',
      type: 'insurance-certificate',
      title: 'Health insurance certificate, Maria Santos',
      expiryDate: m(5),
      uploadedOn: m(-7),
    }),

    // Noor Digital: the licence, the flexi-desk and the zone agreement with its terms confirmed.
    document({
      id: 'do-demo-licence',
      companyId: DEMO_COMPANY_ID,
      type: 'licence',
      title: 'Trade licence, current year',
      issueDate: noorIssued,
      expiryDate: noorExpiry,
      uploadedOn: addDays(noorIssued, 1),
    }),
    // The certificate of incorporation carries the incorporation date (onboarding v2 step 2).
    document({
      id: 'do-demo-certificate',
      companyId: DEMO_COMPANY_ID,
      type: 'certificate-of-incorporation',
      title: 'Certificate of incorporation',
      issueDate: noorIncorporated,
      uploadedOn: addDays(noorIncorporated, 2),
    }),
    document({
      id: 'do-demo-lease',
      companyId: DEMO_COMPANY_ID,
      officeId: 'of-demo-flexi',
      type: 'lease',
      title: 'Flexi-desk agreement',
      issueDate: noorIssued,
      expiryDate: noorExpiry,
      uploadedOn: addDays(noorIssued, 1),
    }),
    document({
      id: 'do-demo-agreement',
      companyId: DEMO_COMPANY_ID,
      type: 'authority-agreement',
      title: 'SRTIP licence agreement',
      issueDate: noorIssued,
      uploadedOn: addDays(noorIssued, 2),
      // Sample terms of the demo agreement, each ticked by the owner. Not a rule of the zone.
      extracted: {
        cancellationWindowDays: { value: 90, confirmedOn: noorAgreedOn },
        cancellationFeeInsideAed: { value: 1500, confirmedOn: noorAgreedOn },
        cancellationFeeOutsideAed: { value: 4500, confirmedOn: noorAgreedOn },
        noticePeriodDays: { value: 30, confirmedOn: noorAgreedOn },
        renewalBundle: {
          value: ['licence', 'flexi-desk', 'establishment card'],
          confirmedOn: noorAgreedOn,
        },
        termMonths: { value: 12, confirmedOn: noorAgreedOn },
        autoRenews: { value: false, confirmedOn: noorAgreedOn },
      },
    }),
    document({
      id: 'do-demo-passport-amina',
      companyId: DEMO_COMPANY_ID,
      personId: 'pe-demo-amina',
      type: 'passport',
      title: 'Passport, Amina Khan',
      expiryDate: m(64),
      uploadedOn: m(-22),
    }),
    document({
      id: 'do-demo-insurance-amina',
      companyId: DEMO_COMPANY_ID,
      personId: 'pe-demo-amina',
      type: 'insurance-policy',
      title: 'Health insurance policy, Amina Khan',
      issueDate: m(-10),
      expiryDate: m(14),
      uploadedOn: m(-10),
    }),

    // Marasi: the agreement was read but nobody ticked the terms, so the rules do not use them.
    document({
      id: 'do-marasi-licence',
      companyId: MARASI_ID,
      type: 'licence',
      title: 'Trade licence, current year',
      issueDate: marasiIssued,
      expiryDate: marasiExpiry,
      uploadedOn: addDays(marasiIssued, 1),
    }),
    document({
      id: 'do-marasi-lease',
      companyId: MARASI_ID,
      officeId: 'of-marasi',
      type: 'lease',
      title: 'Serviced office agreement, Almas Tower',
      issueDate: d(-35),
      expiryDate: d(330),
      uploadedOn: d(-34),
    }),
    document({
      id: 'do-marasi-agreement',
      companyId: MARASI_ID,
      type: 'authority-agreement',
      title: 'DMCC licence agreement',
      issueDate: marasiIssued,
      uploadedOn: addDays(marasiIssued, 2),
      extracted: {
        cancellationWindowDays: { value: 60, confirmedOn: null },
        cancellationFeeInsideAed: { value: 2000, confirmedOn: null },
        cancellationFeeOutsideAed: { value: 6000, confirmedOn: null },
        renewalBundle: { value: ['licence', 'lease', 'establishment card'], confirmedOn: null },
      },
    }),
    document({
      id: 'do-marasi-audit',
      companyId: MARASI_ID,
      type: 'audited-accounts',
      title: 'Audited accounts, last financial year',
      issueDate: d(-40),
      uploadedOn: d(-39),
    }),
    document({
      id: 'do-marasi-ubo',
      companyId: MARASI_ID,
      type: 'ubo-declaration',
      title: 'UBO declaration',
      issueDate: addMonths(marasiIncorporated, 1),
      uploadedOn: addMonths(marasiIncorporated, 1),
    }),

    // Qasr Al Bahr and Hamdan: the licence and the lease.
    document({
      id: 'do-qasr-licence',
      companyId: QASR_ID,
      type: 'licence',
      title: 'Trade licence, current year',
      issueDate: qasrIssued,
      expiryDate: qasrExpiry,
      uploadedOn: addDays(qasrIssued, 2),
    }),
    document({
      id: 'do-qasr-lease',
      companyId: QASR_ID,
      officeId: 'of-qasr',
      type: 'lease',
      title: 'Shop tenancy contract',
      issueDate: d(-165),
      expiryDate: d(200),
      uploadedOn: d(-160),
    }),
    document({
      id: 'do-hamdan-licence',
      companyId: HAMDAN_ID,
      type: 'licence',
      title: 'Trade licence, expired',
      issueDate: hamdanIssued,
      expiryDate: hamdanExpiry,
      uploadedOn: addDays(hamdanIssued, 1),
    }),
    document({
      id: 'do-hamdan-lease',
      companyId: HAMDAN_ID,
      officeId: 'of-hamdan',
      type: 'lease',
      title: 'Warehouse lease, JAFZA',
      issueDate: d(-65),
      expiryDate: d(300),
      uploadedOn: d(-64),
    }),
    document({
      id: 'do-hamdan-wages',
      companyId: HAMDAN_ID,
      type: 'wages-file',
      title: 'WPS wages file, last month',
      issueDate: thisPayDay,
      uploadedOn: thisPayDay,
    }),

    // Sahara: the papers of a closure under way, and the certificate of a branch closed before.
    document({
      id: 'do-sahara-licence',
      companyId: SHARED_COMPANY_ID,
      type: 'licence',
      title: 'Trade licence, current year',
      issueDate: saharaIssued,
      expiryDate: saharaExpiry,
      uploadedOn: addDays(saharaIssued, 1),
    }),
    document({
      id: 'do-sahara-resolution',
      companyId: SHARED_COMPANY_ID,
      type: 'board-resolution',
      title: 'Resolution to dissolve',
      issueDate: d(-20),
      uploadedOn: d(-19),
    }),
    document({
      id: 'do-sahara-liquidator',
      companyId: SHARED_COMPANY_ID,
      type: 'liquidator-appointment',
      title: 'Liquidator appointment letter',
      issueDate: d(-15),
      uploadedOn: d(-14),
    }),
    document({
      id: 'do-sahara-branch-cancel',
      companyId: SHARED_COMPANY_ID,
      type: 'cancellation-certificate',
      title: 'Cancellation certificate, Dubai branch (closed last year)',
      issueDate: m(-11),
      uploadedOn: m(-11),
    }),
  ];

  // Spec 4.1 to 4.3: a PRO on two companies, an accountant on three, a manager on one, and the
  // grant that marks Sahara Ventures as shared with the signed-in owner.
  const accountantAreas = {
    'company-file': { level: 'view', responsible: false },
    documents: { level: 'view', responsible: false },
    'tax-and-accounts': { level: 'edit', responsible: true },
    'calendar-and-costs': { level: 'view', responsible: false },
  } as const;
  const access: AccessGrant[] = [
    {
      id: 'ag-demo-pro',
      member: { name: 'Sara Al Ali', email: 'sara.pro@example.com' },
      roleName: 'PRO',
      companies: [
        {
          companyId: ALREEF_ID,
          areas: {
            documents: { level: 'view', responsible: false },
            people: { level: 'edit', responsible: true },
            'licence-and-cards': { level: 'edit', responsible: true },
          },
        },
        // Not responsible for people here, so she sees only the person assigned to her (Omar).
        {
          companyId: DEMO_COMPANY_ID,
          areas: {
            documents: { level: 'view', responsible: false },
            people: { level: 'edit', responsible: false },
          },
        },
      ],
    },
    {
      id: 'ag-demo-accountant',
      member: { name: 'Faisal Rahman', email: 'faisal@ledgerfirm.example.com' },
      roleName: 'Accountant',
      companies: [
        { companyId: ALREEF_ID, areas: accountantAreas },
        { companyId: MARASI_ID, areas: accountantAreas },
        { companyId: HAMDAN_ID, areas: accountantAreas },
      ],
    },
    {
      id: 'ag-demo-manager',
      member: { name: 'Hana Yousef', email: 'hana.ops@example.com' },
      roleName: 'Operations manager',
      companies: [
        {
          companyId: HAMDAN_ID,
          areas: {
            'company-file': { level: 'edit', responsible: false },
            offices: { level: 'edit', responsible: false },
            documents: { level: 'edit', responsible: false },
            people: { level: 'edit', responsible: false },
            'licence-and-cards': { level: 'edit', responsible: false },
            'tax-and-accounts': { level: 'edit', responsible: false },
            banks: { level: 'edit', responsible: false },
            'calendar-and-costs': { level: 'edit', responsible: false },
          },
        },
      ],
    },
    {
      id: 'ag-shared-owner',
      member: { name: OWNER_NAME, email: OWNER_EMAIL },
      roleName: 'Manager',
      companies: [
        {
          companyId: SHARED_COMPANY_ID,
          areas: {
            'company-file': { level: 'edit', responsible: false },
            offices: { level: 'edit', responsible: false },
            documents: { level: 'edit', responsible: false },
            people: { level: 'edit', responsible: true },
            'licence-and-cards': { level: 'edit', responsible: true },
            'tax-and-accounts': { level: 'edit', responsible: false },
            banks: { level: 'edit', responsible: false },
            'calendar-and-costs': { level: 'edit', responsible: false },
          },
        },
      ],
    },
  ];

  // Closed cards, each under the id the engine gives that cycle (spec 7.3): the wages of this
  // month, the turnover questions of last quarter, one rent cheque, one VAT return and one
  // corporate tax return, so those requirements roll forward and the closed ones read as complete.
  const cards: Card[] = [
    closed('rent-instalment', 'licence-and-cards', ALREEF_ID, 'of-alreef', d(-60), d(-59), {
      kind: 'document',
      documentId: 'do-alreef-rent-receipt',
    }),
    closed(
      'wages-pay-date',
      'people',
      ALREEF_ID,
      null,
      thisPayDay,
      thisPayDay,
      { kind: 'document', documentId: 'do-alreef-wages' },
      'ag-demo-accountant',
    ),
    closed(
      'corporate-tax-return',
      'tax-and-accounts',
      ALREEF_ID,
      null,
      addMonths(alreefYearEnd, federalRules.corporateTax.returnMonths.value),
      d(-14),
      { kind: 'document', documentId: 'do-alreef-ctreturn' },
      'ag-demo-accountant',
    ),
    closed(
      'wages-pay-date',
      'people',
      MARASI_ID,
      null,
      thisPayDay,
      thisPayDay,
      reference('DEMO-WPS-SIF-2209', thisPayDay),
    ),
    closed(
      'vat-return',
      'tax-and-accounts',
      MARASI_ID,
      null,
      addDays(marasiVatPeriodEnd, federalRules.vat.returnDays.value),
      addDays(marasiVatPeriodEnd, 20),
      reference('DEMO-FTA-ACK-771120', addDays(marasiVatPeriodEnd, 20)),
    ),
    closed(
      'wages-pay-date',
      'people',
      QASR_ID,
      null,
      thisPayDay,
      thisPayDay,
      reference('DEMO-WPS-SIF-2210', thisPayDay),
    ),
    closed(
      'turnover-question',
      'tax-and-accounts',
      QASR_ID,
      null,
      lastQuarterEnd,
      addDays(lastQuarterEnd, 2),
      reference('Turnover under the threshold', addDays(lastQuarterEnd, 2)),
    ),
    closed('wages-pay-date', 'people', HAMDAN_ID, null, thisPayDay, thisPayDay, {
      kind: 'document',
      documentId: 'do-hamdan-wages',
    }),
    closed(
      'turnover-question',
      'tax-and-accounts',
      HAMDAN_ID,
      null,
      lastQuarterEnd,
      addDays(lastQuarterEnd, 1),
      reference('Turnover under the threshold', addDays(lastQuarterEnd, 1)),
    ),
    closed(
      'turnover-question',
      'tax-and-accounts',
      SHARED_COMPANY_ID,
      null,
      lastQuarterEnd,
      addDays(lastQuarterEnd, 3),
      reference('Turnover under the threshold', addDays(lastQuarterEnd, 3)),
    ),
  ];

  // The people who act in the trail: the signed-in owner, the three members, the owner of the
  // shared company, and the portal itself for reminders it sent.
  const owner: Actor = { kind: 'owner', name: OWNER_NAME };
  const sara: Actor = { kind: 'member', grantId: 'ag-demo-pro', name: 'Sara Al Ali' };
  const faisal: Actor = { kind: 'member', grantId: 'ag-demo-accountant', name: 'Faisal Rahman' };
  const hana: Actor = { kind: 'member', grantId: 'ag-demo-manager', name: 'Hana Yousef' };
  const khalid: Actor = { kind: 'owner', name: 'Khalid Mansoor' };
  const portal: Actor = { kind: 'system', name: 'Boasis' };

  const noorLicenceCard = cardId(
    requirementId('licence-renewal'),
    null,
    DEMO_COMPANY_ID,
    noorExpiry,
  );
  const alreefLicenceCard = cardId(requirementId('licence-renewal'), null, ALREEF_ID, alreefExpiry);
  const hamdanLicenceCard = cardId(requirementId('licence-renewal'), null, HAMDAN_ID, hamdanExpiry);

  const alreefActivity4620 = companies[0]?.identity.activities[0];
  const noorActivity6201 = companies[1]?.identity.activities[0];
  const marasiNow = companies[2]?.ownership ?? null;

  // Spec 5.1: the dated history of fields. Each company opens with its created entry; then a
  // few real changes, at least one correction and one amendment, and values confirmed from the
  // licence on file.
  const history: HistoryEntry[] = [
    ...companies.map((facts, index): HistoryEntry => ({
      id: `hi-created-${facts.id}`,
      companyId: facts.id,
      subject: { kind: 'company', id: facts.id },
      fieldPath: 'record',
      oldValue: null,
      newValue: null,
      kind: 'created',
      on: addDays(facts.identity.incorporationDate, 5 + index),
      who: facts.id === SHARED_COMPANY_ID ? khalid : owner,
      documentId: null,
    })),
    // Al Reef: the retail activity added by the amended licence in the vault.
    {
      id: 'hi-alreef-activity',
      companyId: ALREEF_ID,
      subject: { kind: 'company', id: ALREEF_ID },
      fieldPath: 'identity.activities',
      oldValue: toJson([alreefActivity4620]),
      newValue: toJson(companies[0]?.identity.activities),
      kind: 'amendment',
      on: addDays(alreefAmendedOn, 1),
      who: owner,
      documentId: 'do-alreef-amended',
    },
    // Al Reef: the current licence's dates, confirmed from the upload.
    {
      id: 'hi-alreef-expiry',
      companyId: ALREEF_ID,
      subject: { kind: 'company', id: ALREEF_ID },
      fieldPath: 'identity.expiryDate',
      oldValue: alreefIssued,
      newValue: alreefExpiry,
      kind: 'from-document',
      on: addDays(alreefIssued, 1),
      who: owner,
      documentId: 'do-alreef-licence',
    },
    // Al Reef: a typed TRN missing a digit, corrected by the accountant.
    {
      id: 'hi-alreef-trn',
      companyId: ALREEF_ID,
      subject: { kind: 'company', id: ALREEF_ID },
      fieldPath: 'tax.vat.trn',
      oldValue: 'DEMO-TRN-10000001',
      newValue: 'DEMO-TRN-100000001',
      kind: 'correction',
      on: d(-21),
      who: faisal,
      documentId: null,
    },
    // Al Reef: a passport number typed wrong, corrected by the PRO.
    {
      id: 'hi-alreef-passport',
      companyId: ALREEF_ID,
      subject: { kind: 'person', id: 'pe-alreef-02' },
      fieldPath: 'identity.passportNumber',
      oldValue: 'DEMO-P-0030',
      newValue: 'DEMO-P-0003',
      kind: 'correction',
      on: d(-45),
      who: sara,
      documentId: null,
    },
    // Al Reef: the office moved to another parking bay.
    {
      id: 'hi-alreef-parking',
      companyId: ALREEF_ID,
      subject: { kind: 'office', id: 'of-alreef' },
      fieldPath: 'services.parking',
      oldValue: 'Bay 2, P1',
      newValue: 'Bay 2, P2',
      kind: 'amendment',
      on: d(-30),
      who: owner,
      documentId: null,
    },
    // Noor Digital: advertising added, with the licence version it came from.
    {
      id: 'hi-noor-activity',
      companyId: DEMO_COMPANY_ID,
      subject: { kind: 'company', id: DEMO_COMPANY_ID },
      fieldPath: 'identity.activities',
      oldValue: toJson([noorActivity6201]),
      newValue: toJson(companies[1]?.identity.activities),
      kind: 'amendment',
      on: noorActivityAddedOn,
      who: owner,
      documentId: null,
    },
    {
      id: 'hi-noor-expiry',
      companyId: DEMO_COMPANY_ID,
      subject: { kind: 'company', id: DEMO_COMPANY_ID },
      fieldPath: 'identity.expiryDate',
      oldValue: noorIssued,
      newValue: noorExpiry,
      kind: 'from-document',
      on: addDays(noorIssued, 1),
      who: owner,
      documentId: 'do-demo-licence',
    },
    // Marasi: a partner left and another came in ten days ago.
    {
      id: 'hi-marasi-shareholders',
      companyId: MARASI_ID,
      subject: { kind: 'company', id: MARASI_ID },
      fieldPath: 'ownership.shareholders',
      oldValue: toJson([
        { name: 'Hessa Al Suwaidi', nationality: 'Jordan', percentage: 50 },
        { name: 'Rashid Karim', nationality: 'Jordan', percentage: 50 },
      ]),
      newValue: toJson(marasiNow?.shareholders),
      kind: 'amendment',
      on: d(-10),
      who: owner,
      documentId: null,
    },
    {
      id: 'hi-marasi-ubos',
      companyId: MARASI_ID,
      subject: { kind: 'company', id: MARASI_ID },
      fieldPath: 'ownership.ubos',
      oldValue: toJson([
        { name: 'Hessa Al Suwaidi', percentage: 50 },
        { name: 'Rashid Karim', percentage: 50 },
      ]),
      newValue: toJson(marasiNow?.ubos),
      kind: 'amendment',
      on: d(-10),
      who: owner,
      documentId: null,
    },
    {
      id: 'hi-marasi-category',
      companyId: MARASI_ID,
      subject: { kind: 'company', id: MARASI_ID },
      fieldPath: 'identity.licenceCategory',
      oldValue: 'Trade',
      newValue: 'Trading licence',
      kind: 'correction',
      on: m(-1),
      who: owner,
      documentId: null,
    },
    // Qasr Al Bahr: a chamber number typed one digit short.
    {
      id: 'hi-qasr-chamber',
      companyId: QASR_ID,
      subject: { kind: 'company', id: QASR_ID },
      fieldPath: 'cards.chamberMembership',
      oldValue: toJson({ number: 'DEMO-ADCCI-5102', expiry: qasrExpiry }),
      newValue: toJson({ number: 'DEMO-ADCCI-51022', expiry: qasrExpiry }),
      kind: 'correction',
      on: d(-3),
      who: owner,
      documentId: null,
    },
    // Hamdan: the outside PRO changed, entered by the operations manager.
    {
      id: 'hi-hamdan-pro',
      companyId: HAMDAN_ID,
      subject: { kind: 'company', id: HAMDAN_ID },
      fieldPath: 'outsidePeople.pro',
      oldValue: toJson({ name: 'Anil Das', email: 'anil.pro@example.com', phone: null }),
      newValue: toJson({
        name: 'Joseph Pinto',
        email: 'joseph.pro@example.com',
        phone: '+971500000404',
      }),
      kind: 'amendment',
      on: m(-2),
      who: hana,
      documentId: null,
    },
  ];

  // A moment on a demo day, in Asia/Dubai.
  const at = (day: IsoDate, time: string): string => `${day}T${time}:00+04:00`;
  let auditIndex = 0;
  const event = (input: Omit<AuditEvent, 'id'>): AuditEvent => {
    auditIndex += 1;
    return { id: `au-${String(auditIndex).padStart(3, '0')}`, ...input };
  };

  // Spec 7.3: ticks, references, reminders sent by email and push, access and field changes,
  // and documents added and replaced, for every company.
  const audit: AuditEvent[] = [
    // Al Reef.
    event({
      companyId: ALREEF_ID,
      when: at(addDays(alreefAmendedOn, 1), '10:05'),
      who: owner,
      kind: 'field-changed',
      summary: 'Amended activities for Al Reef Trading LLC',
      documentId: 'do-alreef-amended',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(m(-7), '11:20'),
      who: owner,
      kind: 'document-replaced',
      summary: 'Replaced Group health insurance policy, version 1 kept',
      documentId: 'do-alreef-policy',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(m(-6), '09:00'),
      who: owner,
      kind: 'access-changed',
      summary: 'Access given to Sara Al Ali (PRO)',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(m(-3), '16:40'),
      who: owner,
      kind: 'access-changed',
      summary: 'Access given to Faisal Rahman (Accountant)',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-85), '12:15'),
      who: sara,
      kind: 'document-added',
      summary: 'Added Fit-out permit',
      documentId: 'do-alreef-fitout',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-59), '10:30'),
      who: owner,
      kind: 'step-ticked',
      summary: 'Ticked "I have done this" on rent instalment',
      cardId: cardId(requirementId('rent-instalment'), 'of-alreef', ALREEF_ID, d(-60)),
      documentId: 'do-alreef-rent-receipt',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-45), '14:10'),
      who: sara,
      kind: 'reference-logged',
      summary: 'Logged reference DEMO-EP-55871 for the entry permit of Priya Nair',
      personId: 'pe-alreef-07',
      documentId: 'do-alreef-permit-priya',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-45), '14:25'),
      who: sara,
      kind: 'field-changed',
      summary: 'Corrected passport number for Rahul Menon',
      personId: 'pe-alreef-02',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-30), '09:45'),
      who: owner,
      kind: 'field-changed',
      summary: 'Amended parking for the office at Office 1204, Bay Square, Business Bay, Dubai',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-21), '11:05'),
      who: faisal,
      kind: 'field-changed',
      summary: 'Corrected TRN for Al Reef Trading LLC',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-14), '15:30'),
      who: faisal,
      kind: 'step-ticked',
      summary: 'Ticked "I have done this" on corporate tax return',
      cardId: cardId(
        requirementId('corporate-tax-return'),
        null,
        ALREEF_ID,
        addMonths(alreefYearEnd, federalRules.corporateTax.returnMonths.value),
      ),
      documentId: 'do-alreef-ctreturn',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(thisPayDay, '10:00'),
      who: faisal,
      kind: 'step-ticked',
      summary: 'Ticked "I have done this" on wages pay date',
      cardId: cardId(requirementId('wages-pay-date'), null, ALREEF_ID, thisPayDay),
      documentId: 'do-alreef-wages',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-2), '08:00'),
      who: portal,
      kind: 'reminder-sent',
      summary: 'Reminder sent to Sara Al Ali by email: passport renewal for Rahul Menon',
      personId: 'pe-alreef-02',
      channel: 'email',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-1), '08:00'),
      who: portal,
      kind: 'reminder-sent',
      summary: 'Reminder sent to Sara Al Ali by email: licence renewal decision',
      cardId: alreefLicenceCard,
      channel: 'email',
    }),
    event({
      companyId: ALREEF_ID,
      when: at(d(-1), '08:01'),
      who: portal,
      kind: 'reminder-sent',
      summary: `Reminder sent to ${OWNER_NAME} by push: licence renewal decision`,
      cardId: alreefLicenceCard,
      channel: 'push',
    }),

    // Noor Digital.
    event({
      companyId: DEMO_COMPANY_ID,
      when: at(addDays(noorIssued, 2), '13:00'),
      who: owner,
      kind: 'document-added',
      summary: 'Added SRTIP licence agreement',
      documentId: 'do-demo-agreement',
    }),
    event({
      companyId: DEMO_COMPANY_ID,
      when: at(noorActivityAddedOn, '10:20'),
      who: owner,
      kind: 'field-changed',
      summary: 'Amended activities for Noor Digital FZE',
    }),
    event({
      companyId: DEMO_COMPANY_ID,
      when: at(m(-5), '09:30'),
      who: owner,
      kind: 'access-changed',
      summary: 'Access given to Sara Al Ali (PRO)',
    }),
    event({
      companyId: DEMO_COMPANY_ID,
      when: at(d(-12), '12:40'),
      who: sara,
      kind: 'reference-logged',
      summary: 'Logged reference DEMO-EP-60102 for the entry permit of Omar Haddad',
      personId: 'pe-demo-omar',
    }),
    event({
      companyId: DEMO_COMPANY_ID,
      when: at(d(-3), '08:00'),
      who: portal,
      kind: 'reminder-sent',
      summary: `Reminder sent to ${OWNER_NAME} by email: licence renewal`,
      cardId: noorLicenceCard,
      channel: 'email',
    }),
    event({
      companyId: DEMO_COMPANY_ID,
      when: at(d(-3), '08:01'),
      who: portal,
      kind: 'reminder-sent',
      summary: `Reminder sent to ${OWNER_NAME} by push: licence renewal`,
      cardId: noorLicenceCard,
      channel: 'push',
    }),

    // Marasi.
    event({
      companyId: MARASI_ID,
      when: at(m(-2), '10:10'),
      who: owner,
      kind: 'access-changed',
      summary: 'Access given to Faisal Rahman (Accountant)',
    }),
    event({
      companyId: MARASI_ID,
      when: at(d(-39), '17:20'),
      who: faisal,
      kind: 'document-added',
      summary: 'Added Audited accounts, last financial year',
      documentId: 'do-marasi-audit',
    }),
    event({
      companyId: MARASI_ID,
      when: at(addDays(marasiVatPeriodEnd, 20), '11:45'),
      who: faisal,
      kind: 'reference-logged',
      summary: 'Logged reference DEMO-FTA-ACK-771120 on vat return',
      cardId: cardId(
        requirementId('vat-return'),
        null,
        MARASI_ID,
        addDays(marasiVatPeriodEnd, federalRules.vat.returnDays.value),
      ),
    }),
    event({
      companyId: MARASI_ID,
      when: at(d(-10), '15:00'),
      who: owner,
      kind: 'field-changed',
      summary: 'Amended shareholders and UBOs for Marasi Commodities DMCC',
    }),
    event({
      companyId: MARASI_ID,
      when: at(thisPayDay, '09:15'),
      who: owner,
      kind: 'reference-logged',
      summary: 'Logged reference DEMO-WPS-SIF-2209 on wages pay date',
      cardId: cardId(requirementId('wages-pay-date'), null, MARASI_ID, thisPayDay),
    }),
    event({
      companyId: MARASI_ID,
      when: at(d(-4), '08:00'),
      who: portal,
      kind: 'reminder-sent',
      summary: `Reminder sent to ${OWNER_NAME} by push: UBO update after the ownership change`,
      channel: 'push',
    }),

    // Qasr Al Bahr.
    event({
      companyId: QASR_ID,
      when: at(addDays(lastQuarterEnd, 2), '10:00'),
      who: owner,
      kind: 'reference-logged',
      summary: 'Logged reference Turnover under the threshold on turnover question',
      cardId: cardId(requirementId('turnover-question'), null, QASR_ID, lastQuarterEnd),
    }),
    event({
      companyId: QASR_ID,
      when: at(thisPayDay, '09:40'),
      who: owner,
      kind: 'reference-logged',
      summary: 'Logged reference DEMO-WPS-SIF-2210 on wages pay date',
      cardId: cardId(requirementId('wages-pay-date'), null, QASR_ID, thisPayDay),
    }),
    event({
      companyId: QASR_ID,
      when: at(d(-3), '18:05'),
      who: owner,
      kind: 'field-changed',
      summary: 'Corrected chamber membership for Qasr Al Bahr Consultancy',
    }),
    event({
      companyId: QASR_ID,
      when: at(d(-1), '08:00'),
      who: portal,
      kind: 'reminder-sent',
      summary: `Reminder sent to ${OWNER_NAME} by email: corporate tax registration`,
      channel: 'email',
    }),

    // Hamdan.
    event({
      companyId: HAMDAN_ID,
      when: at(m(-2), '09:00'),
      who: owner,
      kind: 'access-changed',
      summary: 'Access given to Hana Yousef (Operations manager)',
    }),
    event({
      companyId: HAMDAN_ID,
      when: at(m(-2), '09:05'),
      who: owner,
      kind: 'access-changed',
      summary: 'Access given to Faisal Rahman (Accountant)',
    }),
    event({
      companyId: HAMDAN_ID,
      when: at(m(-2), '14:30'),
      who: hana,
      kind: 'field-changed',
      summary: 'Amended PRO for Hamdan Logistics FZCO',
    }),
    event({
      companyId: HAMDAN_ID,
      when: at(addDays(lastQuarterEnd, 1), '11:00'),
      who: hana,
      kind: 'reference-logged',
      summary: 'Logged reference Turnover under the threshold on turnover question',
      cardId: cardId(requirementId('turnover-question'), null, HAMDAN_ID, lastQuarterEnd),
    }),
    event({
      companyId: HAMDAN_ID,
      when: at(thisPayDay, '10:20'),
      who: hana,
      kind: 'step-ticked',
      summary: 'Ticked "I have done this" on wages pay date',
      cardId: cardId(requirementId('wages-pay-date'), null, HAMDAN_ID, thisPayDay),
      documentId: 'do-hamdan-wages',
    }),
    event({
      companyId: HAMDAN_ID,
      when: at(d(-9), '08:00'),
      who: portal,
      kind: 'reminder-sent',
      summary: `Reminder sent to ${OWNER_NAME} by email: licence renewal`,
      cardId: hamdanLicenceCard,
      channel: 'email',
    }),
    event({
      companyId: HAMDAN_ID,
      when: at(d(-2), '08:00'),
      who: portal,
      kind: 'reminder-sent',
      summary: `Reminder sent to ${OWNER_NAME} by push: licence renewal`,
      cardId: hamdanLicenceCard,
      channel: 'push',
    }),

    // Sahara, the shared company.
    event({
      companyId: SHARED_COMPANY_ID,
      when: at(m(-11), '12:00'),
      who: khalid,
      kind: 'access-changed',
      summary: `Access given to ${OWNER_NAME} (Manager)`,
    }),
    event({
      companyId: SHARED_COMPANY_ID,
      when: at(d(-19), '10:30'),
      who: khalid,
      kind: 'document-added',
      summary: 'Added Resolution to dissolve',
      documentId: 'do-sahara-resolution',
    }),
    event({
      companyId: SHARED_COMPANY_ID,
      when: at(d(-14), '16:15'),
      who: khalid,
      kind: 'document-added',
      summary: 'Added Liquidator appointment letter',
      documentId: 'do-sahara-liquidator',
    }),
    event({
      companyId: SHARED_COMPANY_ID,
      when: at(addDays(lastQuarterEnd, 3), '09:50'),
      who: owner,
      kind: 'reference-logged',
      summary: 'Logged reference Turnover under the threshold on turnover question',
      cardId: cardId(requirementId('turnover-question'), null, SHARED_COMPANY_ID, lastQuarterEnd),
    }),
    event({
      companyId: SHARED_COMPANY_ID,
      when: at(d(-5), '08:00'),
      who: portal,
      kind: 'reminder-sent',
      summary: `Reminder sent to ${OWNER_NAME} by email: cancellation steps`,
      channel: 'email',
    }),
  ];

  return {
    version: MOCK_VERSION,
    companies,
    offices,
    people,
    documents,
    access,
    cards,
    history,
    audit,
    ...onboardingSeed(
      T,
      companies.map((company) => company.id),
    ),
  };
}

// The demo owner's account (onboarding v2 step 0), verified, on the three-company plan, holding
// the demo companies, so a new account sees none of them. The demo came in before onboarding, so
// it holds more companies than the plan covers; the rest of the onboarding records start empty.
export const DEMO_ACCOUNT_ID = 'acc-demo-owner';

export function onboardingSeed(
  day: IsoDate = today(),
  companyIds: readonly string[] = DEMO_COMPANY_IDS,
): OnboardingData {
  return {
    accounts: [
      {
        id: DEMO_ACCOUNT_ID,
        fullName: OWNER_NAME,
        email: OWNER_EMAIL,
        plan: 'up-to-three',
        termsVersion: TERMS_VERSION,
        termsAcceptedOn: day,
        emailVerifiedOn: day,
        twoStepOn: false,
        emailRemindersOn: true,
        createdOn: day,
      },
    ],
    accountCompanies: companyIds.map((companyId) => ({
      accountId: DEMO_ACCOUNT_ID,
      companyId,
      role: 'owner' as const,
      addedOn: day,
    })),
    accountPeople: [],
    roles: [],
    onboardingStarts: [],
    onboardingProgress: [],
    tasks: [],
    reminderEmails: [],
    waitlist: [],
  };
}
