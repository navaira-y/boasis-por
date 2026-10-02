import { describe, expect, it } from 'vitest';
import { AuditEvent, CompanyFacts, Document, HistoryEntry } from './index';

const minimalFacts = {
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
  cards: { immigrationCard: null, mohreCard: null },
  tax: {
    corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
    vat: { status: 'unknown', trn: null },
  },
  visaCapacity: { allowed: 3, used: 1 },
};

describe('company file groups (spec 5.1)', () => {
  it('still parses a company written before the new groups existed', () => {
    expect(CompanyFacts.parse(minimalFacts).ownership).toBeUndefined();
  });

  it('parses every group filled in', () => {
    const parsed = CompanyFacts.parse({
      ...minimalFacts,
      identity: {
        ...minimalFacts.identity,
        activities: [
          {
            code: '6201',
            name: 'Software',
            addedOn: '2025-10-01',
            removedOn: null,
            licenceVersion: { issuedOn: '2025-10-01', documentId: 'do-1' },
          },
        ],
        licenceCategory: 'Flexi-desk package',
        registeredOfficeId: 'of-1',
        firstTaxPeriod: { start: '2025-10-01', end: '2026-12-31' },
        mohreClassification: '2B',
      },
      cards: {
        immigrationCard: null,
        mohreCard: null,
        eSignatureCards: [{ holder: 'A Person', number: 'ES-1', expiry: '2027-01-01' }],
        proCard: { holder: 'A PRO', number: null, expiry: null },
        portalRegistration: { portalName: 'Zone portal', reference: 'P-1', registeredOn: null },
        chamberMembership: { number: 'CH-1', expiry: '2026-09-30' },
        permits: [],
      },
      tax: {
        ...minimalFacts.tax,
        smallBusinessRelief: 'yes',
        auditRequired: 'unknown',
        auditor: { name: 'Sample Auditors', email: null },
      },
      banks: [
        {
          id: 'bk-1',
          bankName: 'Sample Bank',
          kycRefreshOn: null,
          licenceSentOn: null,
          openedOn: '2025-11-01',
          signatories: ['A Person'],
          amendmentSentOn: null,
        },
      ],
      ownership: {
        shareholders: [{ name: 'A Person', nationality: null, percentage: 100 }],
        ubos: null,
        manager: 'A Person',
        signatories: ['A Person'],
        memorandumDate: '2025-10-01',
      },
      outsidePeople: { pro: null, accountant: { name: 'An Accountant', email: null, phone: null } },
      status: { state: 'closed', closedOn: '2026-08-01' },
    });
    expect(parsed.status).toEqual({ state: 'closed', closedOn: '2026-08-01' });
  });

  it('rejects a MOHRE classification outside the list and a percentage above 100', () => {
    expect(() =>
      CompanyFacts.parse({
        ...minimalFacts,
        identity: { ...minimalFacts.identity, mohreClassification: '4' },
      }),
    ).toThrow();
    expect(() =>
      CompanyFacts.parse({
        ...minimalFacts,
        ownership: {
          shareholders: [{ name: 'A', nationality: null, percentage: 120 }],
          ubos: null,
          manager: null,
          signatories: null,
          memorandumDate: null,
        },
      }),
    ).toThrow();
  });

  it('needs a closed date on a closed company', () => {
    expect(() => CompanyFacts.parse({ ...minimalFacts, status: { state: 'closed' } })).toThrow();
  });
});

describe('document versions (spec 5.3)', () => {
  it('parses a document attached to an office with an earlier version kept', () => {
    const parsed = Document.parse({
      id: 'do-1',
      companyId: 'co-1',
      personId: null,
      officeId: 'of-1',
      type: 'lease',
      title: 'Tenancy contract',
      issueDate: '2026-01-01',
      expiryDate: '2027-01-01',
      fileName: 'lease-v2.pdf',
      uploadedOn: '2026-02-01',
      version: 2,
      previousVersions: [
        {
          version: 1,
          title: 'Tenancy contract',
          fileName: 'lease.pdf',
          issueDate: '2026-01-01',
          expiryDate: '2027-01-01',
          uploadedOn: '2026-01-02',
          replacedOn: '2026-02-01',
        },
      ],
    });
    expect(parsed.previousVersions).toHaveLength(1);
  });
});

describe('history and audit trail (spec 5.1, 7.3)', () => {
  it('parses a correction with list values and a member as who', () => {
    const parsed = HistoryEntry.parse({
      id: 'hi-1',
      companyId: 'co-1',
      subject: { kind: 'company', id: 'co-1' },
      fieldPath: 'ownership.shareholders',
      oldValue: [{ name: 'A', percentage: 50 }],
      newValue: [{ name: 'B', percentage: 50 }],
      kind: 'correction',
      on: '2026-09-01',
      who: { kind: 'member', grantId: 'ag-1', name: 'A Member' },
    });
    expect(parsed.kind).toBe('correction');
  });

  it('rejects an unknown history kind and a member without a grant', () => {
    const entry = {
      id: 'hi-1',
      companyId: 'co-1',
      subject: { kind: 'office', id: 'of-1' },
      fieldPath: 'lease.rentAed',
      oldValue: 1,
      newValue: 2,
      kind: 'edit',
      on: '2026-09-01',
      who: { kind: 'owner', name: 'Owner' },
    };
    expect(() => HistoryEntry.parse(entry)).toThrow();
    expect(() =>
      HistoryEntry.parse({ ...entry, kind: 'amendment', who: { kind: 'member', name: 'M' } }),
    ).toThrow();
  });

  it('parses a reminder sent by push with its link to the card', () => {
    const parsed = AuditEvent.parse({
      id: 'au-1',
      companyId: 'co-1',
      when: '2026-09-14T08:00:00+04:00',
      who: { kind: 'system', name: 'Boasis' },
      kind: 'reminder-sent',
      summary: 'Reminder sent to the owner by push',
      cardId: 'licence-renewal:co-1:2026-09-30',
      channel: 'push',
    });
    expect(parsed.channel).toBe('push');
  });

  it('rejects a moment without an offset', () => {
    expect(() =>
      AuditEvent.parse({
        id: 'au-1',
        companyId: 'co-1',
        when: '2026-09-14 08:00',
        who: { kind: 'owner', name: 'Owner' },
        kind: 'field-changed',
        summary: 'Changed',
      }),
    ).toThrow();
  });
});
