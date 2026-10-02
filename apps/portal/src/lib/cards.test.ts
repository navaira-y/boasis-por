import { requirementId } from '@boasis/rules';
import type { AccessGrant, Card } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { licenceFeeOf, recipientOf } from './cards';

describe('licenceFeeOf', () => {
  it('is unknown when the authority lists several packages and the company has none recorded', () => {
    const packages = [
      { name: 'SPARK STARTER package (0 visas)', amountAed: 3999 },
      { name: 'SPARK GROWTH package (1 visa)', amountAed: 6499 },
      { name: 'SPARK ELITE package (2 visas)', amountAed: 8499 },
    ];
    expect(licenceFeeOf(packages)).toBeNull();
  });

  it('is the one fee line when there is only one', () => {
    const line = { name: 'Licence fee', amountAed: 12000 };
    expect(licenceFeeOf([line])).toEqual(line);
  });

  it('is unknown without fee lines', () => {
    expect(licenceFeeOf(null)).toBeNull();
    expect(licenceFeeOf([])).toBeNull();
  });
});

describe('recipientOf', () => {
  const grant = (id: string, name: string, responsible: boolean): AccessGrant => ({
    id,
    member: { name, email: `${id}@example.com` },
    roleName: 'PRO',
    companies: [
      { companyId: 'co-1', areas: { 'licence-and-cards': { level: 'edit', responsible } } },
    ],
  });
  const card = (steps: Card['steps'] = []): Card => ({
    id: 'licence-renewal:co-1:2027-09-30',
    companyId: 'co-1',
    requirementId: requirementId('licence-renewal'),
    area: 'licence-and-cards',
    state: 'on-track',
    dueOn: '2027-09-30',
    actBy: '2027-09-30',
    subjectId: null,
    responsibleId: null,
    steps,
    evidence: [],
  });

  it('is the assignee of the first open step', () => {
    const grants = [grant('ag-pro', 'Sara Al Ali', true), grant('ag-acc', 'Faisal Rahman', false)];
    const steps: Card['steps'] = [
      { id: 's1', title: 'Done already', done: true, doneOn: '2027-09-01', assigneeId: 'ag-pro' },
      { id: 's2', title: 'Still open', done: false, doneOn: null, assigneeId: 'ag-acc' },
    ];
    expect(recipientOf(card(steps), grants)).toBe('Faisal Rahman');
  });

  it('is the responsible person when no open step is assigned', () => {
    expect(recipientOf(card(), [grant('ag-pro', 'Sara Al Ali', true)])).toBe('Sara Al Ali');
  });

  it('is every owner (null) when nobody is responsible', () => {
    expect(recipientOf(card(), [grant('ag-pro', 'Sara Al Ali', false)])).toBeNull();
  });
});
