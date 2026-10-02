import type { Actor, Card } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { createMockRepos, type Clock, type SessionIdentity } from './repos';
import {
  ALREEF_ID,
  DEMO_COMPANY_ID,
  DEMO_COMPANY_IDS,
  DEMO_COMPANY_NAME,
  OWNER_NAME,
  QASR_ID,
} from './seed';
import { memoryAdapter, MOCK_STORAGE_KEY } from './store';

// A clock that moves one minute per write, so the trail has an order to check.
function testClock(): Clock {
  let minute = 0;
  return {
    today: () => '2099-01-15',
    now: () => {
      minute += 1;
      return `2099-01-15T10:${String(minute).padStart(2, '0')}:00+04:00`;
    },
  };
}

const asOwner = (): SessionIdentity => ({ ownerName: OWNER_NAME, actingAs: null });
const asPro = (): SessionIdentity => ({ ownerName: OWNER_NAME, actingAs: 'ag-demo-pro' });
const owner: Actor = { kind: 'owner', name: OWNER_NAME };
const pro: Actor = { kind: 'member', grantId: 'ag-demo-pro', name: 'Sara Al Ali' };

describe('mock repos', () => {
  it('seeds the demo companies with their offices, people, documents and grants', async () => {
    const repos = createMockRepos(memoryAdapter());
    const companies = await repos.companies.list();
    expect(companies.map((company) => company.id)).toEqual([...DEMO_COMPANY_IDS]);
    expect(companies.find((company) => company.id === DEMO_COMPANY_ID)?.identity.tradeName).toBe(
      DEMO_COMPANY_NAME,
    );
    expect(await repos.offices.list(DEMO_COMPANY_ID)).toHaveLength(1);
    expect(await repos.people.list(DEMO_COMPANY_ID)).toHaveLength(2);
    expect(await repos.documents.list(DEMO_COMPANY_ID)).toHaveLength(6);
    // Four since the data foundation added the operations manager (spec 4.1): the PRO, the
    // accountant, the manager, and the grant that shares Sahara Ventures with the owner.
    expect(await repos.access.list()).toHaveLength(4);
    expect(await repos.cards.list(DEMO_COMPANY_ID)).toHaveLength(0);
  });

  it('persists through the adapter and restores on the next start', async () => {
    const adapter = memoryAdapter();
    const first = createMockRepos(adapter);
    const company = await first.companies.get(DEMO_COMPANY_ID);
    if (company === null) {
      throw new Error('demo company missing');
    }
    await first.companies.update(DEMO_COMPANY_ID, {
      visaCapacity: { ...company.visaCapacity, used: 3 },
    });
    const second = createMockRepos(adapter);
    expect((await second.companies.get(DEMO_COMPANY_ID))?.visaCapacity.used).toBe(3);
  });

  it('validates writes against the schema', async () => {
    const repos = createMockRepos(memoryAdapter());
    await expect(
      repos.people.update('pe-demo-omar', { notify: 'yes' as unknown as boolean }),
    ).rejects.toThrow();
  });

  it('uses the agreed storage key', () => {
    expect(MOCK_STORAGE_KEY).toBe('boasis.portal.mock');
  });
});

describe('field history (spec 5.1)', () => {
  it('writes one entry per changed field with the kind given', async () => {
    const repos = createMockRepos(memoryAdapter(), asOwner, testClock());
    const company = await repos.companies.get(ALREEF_ID);
    if (company === null) {
      throw new Error('Al Reef missing');
    }
    await repos.companies.updateFields(
      ALREEF_ID,
      {
        identity: { ...company.identity, licenceCategory: 'General trading' },
        tax: { ...company.tax, auditRequired: 'yes' },
      },
      'correction',
    );
    const entries = await repos.history.list(ALREEF_ID, {
      subject: { kind: 'company', id: ALREEF_ID },
    });
    const fresh = entries.filter((entry) => entry.on === '2099-01-15');
    expect(fresh.map((entry) => [entry.fieldPath, entry.kind]).sort()).toEqual([
      ['identity.licenceCategory', 'correction'],
      ['tax.auditRequired', 'correction'],
    ]);
    const category = fresh.find((entry) => entry.fieldPath === 'identity.licenceCategory');
    expect(category?.oldValue).toBe('Commercial licence');
    expect(category?.newValue).toBe('General trading');
    expect(category?.who).toEqual(owner);
  });

  it('writes an amendment with its document, and filters by field', async () => {
    const repos = createMockRepos(memoryAdapter(), asOwner, testClock());
    const company = await repos.companies.get(DEMO_COMPANY_ID);
    if (company?.ownership == null) {
      throw new Error('Noor ownership missing');
    }
    await repos.companies.updateFields(
      DEMO_COMPANY_ID,
      { ownership: { ...company.ownership, manager: 'Omar Haddad' } },
      'amendment',
      { documentId: 'do-demo-licence' },
    );
    const entries = await repos.history.list(DEMO_COMPANY_ID, { fieldPath: 'ownership' });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      fieldPath: 'ownership.manager',
      kind: 'amendment',
      oldValue: 'Amina Khan',
      newValue: 'Omar Haddad',
      documentId: 'do-demo-licence',
    });
    const trail = await repos.audit.list(DEMO_COMPANY_ID);
    expect(trail[0]).toMatchObject({ kind: 'field-changed', documentId: 'do-demo-licence' });
    expect(trail[0]?.summary).toBe('Amended manager for Noor Digital FZE');
  });

  it('writes office and person history under their own subject, by the acting member', async () => {
    const repos = createMockRepos(memoryAdapter(), asPro, testClock());
    const office = await repos.offices.get('of-alreef');
    const person = await repos.people.get('pe-alreef-07');
    if (office === null || person === null) {
      throw new Error('seed record missing');
    }
    await repos.offices.updateFields(
      'of-alreef',
      { services: { ...office.services, parking: 'Bay 3, P2' } },
      'amendment',
    );
    await repos.people.updateFields(
      'pe-alreef-07',
      { identity: { ...person.identity, role: 'Senior cashier' } },
      'correction',
    );
    const officeEntries = await repos.history.list(ALREEF_ID, {
      subject: { kind: 'office', id: 'of-alreef' },
      fieldPath: 'services.parking',
    });
    expect(officeEntries[0]).toMatchObject({ kind: 'amendment', newValue: 'Bay 3, P2', who: pro });
    const personEntries = await repos.history.list(ALREEF_ID, {
      subject: { kind: 'person', id: 'pe-alreef-07' },
    });
    expect(personEntries[0]).toMatchObject({ fieldPath: 'identity.role', kind: 'correction' });
    const trail = await repos.audit.list(ALREEF_ID);
    expect(trail[0]).toMatchObject({ personId: 'pe-alreef-07', who: pro });
  });

  it('keeps the history for updateFields only, and logs nothing for no change', async () => {
    const repos = createMockRepos(memoryAdapter(), asOwner, testClock());
    const before = (await repos.history.list(QASR_ID)).length;
    const trailBefore = (await repos.audit.list(QASR_ID)).length;
    const company = await repos.companies.get(QASR_ID);
    if (company === null) {
      throw new Error('Qasr missing');
    }
    const patch = { visaCapacity: { ...company.visaCapacity, used: 2 } };
    await repos.companies.update(QASR_ID, patch);
    await repos.companies.update(QASR_ID, patch);
    expect(await repos.history.list(QASR_ID)).toHaveLength(before);
    expect(await repos.audit.list(QASR_ID)).toHaveLength(trailBefore + 1);
  });

  it('opens a created entry for a new person', async () => {
    const repos = createMockRepos(memoryAdapter(), asOwner, testClock());
    const template = await repos.people.get('pe-demo-omar');
    if (template === null) {
      throw new Error('Omar missing');
    }
    const { id, ...rest } = template;
    expect(id).toBe('pe-demo-omar');
    const added = await repos.people.create({
      ...rest,
      identity: { ...rest.identity, name: 'New Person', passportNumber: 'DEMO-P-9999' },
    });
    const entries = await repos.history.list(DEMO_COMPANY_ID, {
      subject: { kind: 'person', id: added.id },
    });
    expect(entries).toMatchObject([{ kind: 'created', fieldPath: 'record' }]);
  });
});

describe('documents (spec 5.3)', () => {
  it('keeps the old version when a document is replaced', async () => {
    const repos = createMockRepos(memoryAdapter(), asOwner, testClock());
    const replaced = await repos.documents.replace('do-demo-licence', {
      fileName: 'licence-renewed.pdf',
      uploadedOn: '2099-01-15',
      issueDate: '2099-01-10',
      expiryDate: '2100-01-09',
    });
    expect(replaced.version).toBe(2);
    expect(replaced.fileName).toBe('licence-renewed.pdf');
    expect(replaced.title).toBe('Trade licence, current year');
    const versions = await repos.documents.versions('do-demo-licence');
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      version: 1,
      fileName: 'do-demo-licence.pdf',
      replacedOn: '2099-01-15',
    });
    await repos.documents.replace('do-demo-licence', {
      fileName: 'licence-third.pdf',
      uploadedOn: '2099-02-01',
      issueDate: null,
      expiryDate: null,
    });
    const order = (await repos.documents.versions('do-demo-licence')).map((v) => v.version);
    expect(order).toEqual([2, 1]);
    const trail = await repos.audit.list(DEMO_COMPANY_ID);
    expect(trail[0]).toMatchObject({ kind: 'document-replaced', documentId: 'do-demo-licence' });
  });

  it('refuses to delete for anyone but an owner, and deletes for the owner', async () => {
    const repos = createMockRepos(memoryAdapter(), asOwner, testClock());
    await expect(repos.documents.remove('do-alreef-lease', pro)).rejects.toThrow(/owner/);
    expect(await repos.documents.get('do-alreef-lease')).not.toBeNull();
    await expect(
      repos.documents.remove('do-alreef-lease', { kind: 'system', name: 'Boasis' }),
    ).rejects.toThrow();
    await repos.documents.remove('do-alreef-lease', owner);
    expect(await repos.documents.get('do-alreef-lease')).toBeNull();
    expect((await repos.offices.get('of-alreef'))?.lease.tenancyContractDocumentId).toBeNull();
    const trail = await repos.audit.list(ALREEF_ID);
    expect(trail[0]).toMatchObject({ kind: 'document-deleted', documentId: 'do-alreef-lease' });
  });

  it('logs an added document with who added it', async () => {
    const repos = createMockRepos(memoryAdapter(), asPro, testClock());
    const added = await repos.documents.create({
      companyId: ALREEF_ID,
      personId: 'pe-alreef-08',
      officeId: null,
      type: 'passport',
      title: 'Passport, Samuel Adeyemi',
      issueDate: null,
      expiryDate: null,
      fileName: 'passport.pdf',
      uploadedOn: '2099-01-15',
      version: 1,
    });
    const trail = await repos.audit.list(ALREEF_ID);
    expect(trail[0]).toMatchObject({
      kind: 'document-added',
      documentId: added.id,
      personId: 'pe-alreef-08',
      who: pro,
    });
  });
});

describe('audit trail (spec 7.3)', () => {
  it('lists a company newest first', async () => {
    const repos = createMockRepos(memoryAdapter());
    const trail = await repos.audit.list(ALREEF_ID);
    expect(trail.length).toBeGreaterThan(5);
    const stamps = trail.map((event) => event.when);
    expect([...stamps].sort().reverse()).toEqual(stamps);
    expect(trail.every((event) => event.companyId === ALREEF_ID)).toBe(true);
  });

  it('logs a tick and a reference on a card', async () => {
    const repos = createMockRepos(memoryAdapter(), asOwner, testClock());
    const card: Card = {
      id: 'licence-renewal:co-demo-noor:2099-02-01',
      companyId: DEMO_COMPANY_ID,
      requirementId: 'licence-renewal' as Card['requirementId'],
      area: 'licence-and-cards',
      state: 'expiring',
      dueOn: '2099-02-01',
      subjectId: null,
      responsibleId: null,
      steps: [
        { id: 's1', title: 'Collect the papers', done: false, doneOn: null, assigneeId: null },
        { id: 's2', title: 'Submit', done: false, doneOn: null, assigneeId: null },
      ],
      evidence: [],
    };
    await repos.cards.put(card);
    const [first, ...others] = card.steps;
    if (first === undefined) {
      throw new Error('no step');
    }
    const ticked: Card = {
      ...card,
      steps: [{ ...first, done: true, doneOn: '2099-01-15' }, ...others],
    };
    await repos.cards.put(ticked);
    await repos.cards.put({
      ...ticked,
      evidence: [{ kind: 'reference', reference: 'DEMO-REF-1', date: '2099-01-15' }],
    });
    const trail = await repos.audit.list(DEMO_COMPANY_ID);
    expect(trail.slice(0, 3).map((event) => event.kind)).toEqual([
      'reference-logged',
      'step-ticked',
      'field-changed',
    ]);
    expect(trail[1]?.summary).toBe('Ticked "Collect the papers" on licence renewal');
    expect(trail[0]?.cardId).toBe(card.id);
  });

  it('logs an access change on every company it touches', async () => {
    const repos = createMockRepos(memoryAdapter(), asOwner, testClock());
    const grant = await repos.access.get('ag-demo-pro');
    if (grant === null) {
      throw new Error('PRO grant missing');
    }
    await repos.access.update('ag-demo-pro', {
      companies: [
        ...grant.companies.filter((entry) => entry.companyId !== DEMO_COMPANY_ID),
        { companyId: QASR_ID, areas: { people: { level: 'view', responsible: false } } },
      ],
    });
    expect((await repos.audit.list(DEMO_COMPANY_ID))[0]?.summary).toBe(
      'Access removed for Sara Al Ali (PRO)',
    );
    expect((await repos.audit.list(QASR_ID))[0]?.summary).toBe('Access given to Sara Al Ali (PRO)');
    const alreef = await repos.audit.list(ALREEF_ID);
    expect(alreef.some((event) => event.when.startsWith('2099'))).toBe(false);
  });
});
