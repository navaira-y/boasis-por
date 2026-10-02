import { describe, expect, it } from 'vitest';
import { nextOccurrence } from './next-occurrence';
import { TODAY, card, document } from './testing/fixtures';

const SRTIP = 'co-srtip';

describe('nextOccurrence (spec 7.3)', () => {
  const licence = card(SRTIP, 'licence-renewal', {
    id: 'licence-renewal:co-srtip:2026-09-30',
    dueOn: '2026-09-30',
    state: 'complete',
    responsibleId: 'ag-pro',
    steps: [{ id: 'st-1', title: 'Upload', done: true, doneOn: TODAY, assigneeId: null }],
  });

  it('sets the licence card for next year from the renewed licence', () => {
    const renewed = document(SRTIP, 'doc-new', {
      issueDate: '2026-10-01',
      expiryDate: '2027-09-30',
    });
    const next = nextOccurrence(
      licence,
      { kind: 'document', documentId: 'doc-new' },
      { documents: [renewed], today: TODAY },
    );
    expect(next).toEqual({
      id: 'licence-renewal:co-srtip:2027-09-30',
      companyId: SRTIP,
      requirementId: 'licence-renewal',
      area: 'licence-and-cards',
      state: 'on-track',
      dueOn: '2027-09-30',
      actBy: '2027-09-30',
      subjectId: null,
      responsibleId: 'ag-pro',
      steps: [],
      evidence: [],
    });
  });

  it('rolls a yearly card twelve months on a reference, and a quarterly one three', () => {
    const next = nextOccurrence(
      licence,
      { kind: 'reference', reference: 'REN-1', date: TODAY },
      { today: TODAY },
    );
    expect(next?.dueOn).toBe('2027-09-30');
    const vat = card(SRTIP, 'vat-return', {
      id: 'vat-return:co-srtip:2026-07-28',
      dueOn: '2026-07-28',
    });
    expect(
      nextOccurrence(vat, { kind: 'reference', reference: 'VAT-1', date: TODAY }, { today: TODAY })
        ?.dueOn,
    ).toBe('2026-10-28');
    const wages = card(SRTIP, 'wages-pay-date', {
      id: 'wages-pay-date:co-srtip:2026-09-01',
      dueOn: '2026-09-01',
    });
    expect(
      nextOccurrence(
        wages,
        { kind: 'reference', reference: 'WPS-1', date: TODAY },
        { today: TODAY },
      )?.dueOn,
    ).toBe('2026-10-01');
  });

  it('moves a weekend due date to its act-by day', () => {
    const next = nextOccurrence(
      licence,
      { kind: 'reference', reference: 'R', date: TODAY },
      { today: TODAY, holidays: ['2027-09-30'] },
    );
    expect(next?.actBy).toBe('2027-09-29');
  });

  it('returns null for a one-off requirement, a per-person requirement without a document, or a missing date', () => {
    const ubo = card(SRTIP, 'ubo-declaration', { dueOn: '2025-11-30' });
    expect(
      nextOccurrence(ubo, { kind: 'reference', reference: 'U', date: TODAY }, { today: TODAY }),
    ).toBeNull();
    const visa = card(SRTIP, 'residence-visa-renewal', { subjectId: 'pe-1', dueOn: '2027-11-19' });
    expect(
      nextOccurrence(visa, { kind: 'reference', reference: 'V', date: TODAY }, { today: TODAY }),
    ).toBeNull();
    const undated = card(SRTIP, 'licence-renewal', { dueOn: null });
    expect(
      nextOccurrence(undated, { kind: 'reference', reference: 'R', date: TODAY }, { today: TODAY }),
    ).toBeNull();
    expect(
      nextOccurrence(licence, { kind: 'document', documentId: 'missing' }, { today: TODAY })?.dueOn,
    ).toBe('2027-09-30');
    const unknownRequirement = {
      ...licence,
      requirementId: 'not-a-requirement' as typeof licence.requirementId,
    };
    expect(
      nextOccurrence(
        unknownRequirement,
        { kind: 'reference', reference: 'R', date: TODAY },
        { today: TODAY },
      ),
    ).toBeNull();
  });

  it('follows the new policy for a per-person card with a document', () => {
    const insurance = card(SRTIP, 'health-insurance-renewal', {
      id: 'health-insurance-renewal:pe-1:2026-11-19',
      subjectId: 'pe-1',
      area: 'people',
      dueOn: '2026-11-19',
    });
    const policy = document(SRTIP, 'doc-policy', {
      personId: 'pe-1',
      type: 'insurance-policy',
      expiryDate: '2027-11-19',
    });
    const next = nextOccurrence(
      insurance,
      { kind: 'document', documentId: 'doc-policy' },
      { documents: [policy], today: TODAY },
    );
    expect(next?.id).toBe('health-insurance-renewal:pe-1:2027-11-19');
    expect(next?.subjectId).toBe('pe-1');
  });
});
