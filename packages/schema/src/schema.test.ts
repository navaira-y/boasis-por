import { describe, expect, it } from 'vitest';
import {
  AccessGrant,
  AuthorityFile,
  Card,
  CompanyFacts,
  Document,
  Office,
  Person,
  Reminder,
} from './index';

const checked = { source: 'sample', lastChecked: '2026-09-12', grade: 'unclear' as const };

describe('schema samples', () => {
  it('parses CompanyFacts', () => {
    const parsed = CompanyFacts.parse({
      id: 'co-1',
      identity: {
        tradeName: 'Sample Trading FZE',
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
        corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
        vat: { status: 'unknown', trn: null },
      },
      visaCapacity: { allowed: 3, used: 1 },
    });
    expect(parsed.identity.activities).toHaveLength(1);
  });

  it('parses Office', () => {
    const parsed = Office.parse({
      id: 'of-1',
      companyId: 'co-1',
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
      capacity: { quotaAllowed: 3, quotaUsed: 1 },
    });
    expect(parsed.premises.type).toBe('flexi-desk');
  });

  it('parses Person', () => {
    const parsed = Person.parse({
      id: 'pe-1',
      companyId: 'co-1',
      identity: {
        name: 'Amina Khan',
        nationality: 'Pakistan',
        passportNumber: 'AB1234567',
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
        visaNumber: null,
        unifiedNumber: null,
        visaExpiry: '2027-11-19',
        emiratesIdNumber: null,
        emiratesIdExpiry: '2027-11-19',
        workPermitExpiry: null,
        contractType: null,
        noticePeriodDays: 30,
        contractStart: null,
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
      contact: { email: 'amina@example.com', phone: null },
      notify: true,
    });
    expect(parsed.status.stage).toBe('residence-visa');
  });

  it('parses Document', () => {
    const parsed = Document.parse({
      id: 'do-1',
      companyId: 'co-1',
      personId: null,
      type: 'licence',
      title: 'Trade licence',
      issueDate: '2025-10-01',
      expiryDate: '2026-09-30',
      fileName: 'licence.pdf',
      uploadedOn: '2025-10-02',
      version: 1,
    });
    expect(parsed.type).toBe('licence');
  });

  it('parses a Document with extracted terms, confirmed or not', () => {
    const parsed = Document.parse({
      id: 'do-2',
      companyId: 'co-1',
      personId: null,
      type: 'authority-agreement',
      title: 'Zone licence agreement',
      issueDate: '2025-10-01',
      expiryDate: null,
      fileName: 'agreement.pdf',
      uploadedOn: '2025-10-02',
      version: 1,
      extracted: {
        cancellationWindowDays: { value: 90, confirmedOn: '2025-10-03' },
        cancellationFeeInsideAed: { value: 1500, confirmedOn: null },
        renewalBundle: { value: ['licence', 'flexi-desk'], confirmedOn: '2025-10-03' },
        autoRenews: null,
      },
    });
    expect(parsed.extracted?.cancellationWindowDays?.confirmedOn).toBe('2025-10-03');
    expect(parsed.extracted?.cancellationFeeInsideAed?.confirmedOn).toBeNull();
  });

  it('parses owner answers on CompanyFacts and rejects an unknown question', () => {
    const answers = [
      { questionId: 'wpsApplies', answer: false, answeredOn: '2026-09-12', source: 'owner-answer' },
    ];
    expect(CompanyFacts.shape.answers.safeParse(answers).success).toBe(true);
    expect(
      CompanyFacts.shape.answers.safeParse([{ ...answers[0], questionId: 'headcount' }]).success,
    ).toBe(false);
  });

  it('parses AccessGrant', () => {
    const parsed = AccessGrant.parse({
      id: 'ag-1',
      member: { name: 'Sara PRO', email: 'sara@example.com' },
      roleName: 'PRO',
      companies: [
        {
          companyId: 'co-1',
          areas: {
            documents: { level: 'view', responsible: false },
            people: { level: 'edit', responsible: true },
          },
        },
      ],
    });
    expect(parsed.companies[0]?.areas.people?.level).toBe('edit');
  });

  it('parses AuthorityFile with an identity block and empty parts', () => {
    const parsed = AuthorityFile.parse({
      id: 'srtip',
      version: '0.0.0',
      identity: {
        name: { value: 'SRTIP', ...checked },
        emirate: { value: 'Sharjah', ...checked },
        type: { value: 'free-zone', ...checked },
        visaSponsor: { value: 'zone', ...checked },
        submissionChannel: { value: '', ...checked },
        portalAddress: { value: '', ...checked },
      },
      licence: {},
      cards: [],
      premises: {},
      people: {},
      companyRequirements: {},
      playbooks: [],
      library: [],
    });
    expect(parsed.identity.type.grade).toBe('unclear');
  });

  it('rejects an authority fact without a source', () => {
    const result = AuthorityFile.shape.identity.shape.name.safeParse({
      value: 'SRTIP',
      lastChecked: '2026-09-12',
      grade: 'confirmed',
    });
    expect(result.success).toBe(false);
  });

  it('parses Card', () => {
    const parsed = Card.parse({
      id: 'ca-1',
      companyId: 'co-1',
      requirementId: 'licence-renewal',
      area: 'licence-and-cards',
      state: 'decision-needed',
      dueOn: '2026-09-30',
      responsibleId: null,
      steps: [
        {
          id: 'st-1',
          title: 'Answer the decision point',
          done: false,
          doneOn: null,
          assigneeId: null,
        },
      ],
      evidence: [{ kind: 'reference', reference: 'REF-1', date: '2026-09-01' }],
    });
    expect(parsed.state).toBe('decision-needed');
  });

  it('parses Reminder', () => {
    const parsed = Reminder.parse({
      id: 're-1',
      companyId: 'co-1',
      cardId: 'ca-1',
      dueOn: '2026-09-30',
      offsetDays: 90,
      recipientId: 'ag-1',
      channel: 'email',
      state: 'scheduled',
      sentOn: null,
    });
    expect(parsed.offsetDays).toBe(90);
  });
});
