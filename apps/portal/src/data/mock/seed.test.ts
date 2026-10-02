import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { computeCards, decisionPoint } from '@boasis/rules';
import { AuthorityFile, CardState, DocumentType, type Card } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { federalRules } from '../../content/federal';
import { isColourSlot } from '../../lib/companyColours';
import { today } from '../../lib/today';
import { seed, DEMO_COMPANY_ID, DEMO_COMPANY_IDS, ALREEF_ID, HAMDAN_ID, QASR_ID } from './seed';
import { MockData, MOCK_VERSION } from './store';

// content/authorities/, resolved from this file so no absolute path is written anywhere.
const authoritiesDir = new URL('../../../../../content/authorities/', import.meta.url);

async function authority(id: string): Promise<AuthorityFile> {
  const raw = await readFile(fileURLToPath(new URL(`${id}.json`, authoritiesDir)), 'utf8');
  return AuthorityFile.parse(JSON.parse(raw));
}

async function allCards(): Promise<Card[]> {
  const data = seed();
  const day = today();
  const cards: Card[] = [];
  for (const facts of data.companies) {
    const file = await authority(facts.identity.authority);
    cards.push(
      ...computeCards({
        facts,
        offices: data.offices.filter((office) => office.companyId === facts.id),
        people: data.people.filter((person) => person.companyId === facts.id),
        documents: data.documents.filter((document) => document.companyId === facts.id),
        existingCards: data.cards.filter((card) => card.companyId === facts.id),
        authority: file,
        federal: federalRules,
        today: day,
        holidays: [],
      }),
    );
  }
  return cards;
}

describe('seed company colours', () => {
  it('gives every demo company its own colour from the company palette', () => {
    const slots = seed().companies.map((facts) => facts.brand?.colourSlot);
    for (const slot of slots) {
      expect(isColourSlot(slot)).toBe(true);
    }
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe('demo seed', () => {
  it('holds six companies, one of them shared, across five authorities', () => {
    const data = seed();
    expect(data.companies.map((company) => company.id)).toEqual([...DEMO_COMPANY_IDS]);
    expect(new Set(data.companies.map((company) => company.identity.authority)).size).toBe(5);
    expect(data.people).toHaveLength(29);
    expect(data.offices).toHaveLength(6);
  });

  it('places people at every one of the ten stages', () => {
    const stages = new Set(seed().people.map((person) => person.status.stage));
    expect(stages.size).toBe(10);
  });

  it('files a document of every type', () => {
    const types = new Set(seed().documents.map((document) => document.type));
    expect(types.size).toBe(DocumentType.options.length);
  });

  it('lands a card in every one of the seven states today', async () => {
    const cards = await allCards();
    const states = new Set(cards.map((card) => card.state));
    for (const state of CardState.options) {
      expect(states.has(state), `no card in state ${state}`).toBe(true);
    }
  });

  it('puts the decision point on the Dubai mainland licence and the closing prompt with it', async () => {
    const cards = await allCards();
    const licence = cards.find(
      (card) => card.companyId === ALREEF_ID && card.requirementId === 'licence-renewal',
    );
    expect(licence?.state).toBe('decision-needed');
    const data = seed();
    const facts = data.companies.find((company) => company.id === ALREEF_ID);
    if (facts === undefined) {
      throw new Error('Al Reef missing');
    }
    const point = decisionPoint(facts, await authority('dubai-mainland'), today());
    expect(point.closingPrompt?.open).toBe(true);
  });

  it('gives the SRTIP company its cancellation terms from the agreement', async () => {
    const data = seed();
    const facts = data.companies.find((company) => company.id === DEMO_COMPANY_ID);
    if (facts === undefined) {
      throw new Error('Noor missing');
    }
    const point = decisionPoint(
      facts,
      await authority('srtip'),
      today(),
      data.documents.filter((document) => document.companyId === DEMO_COMPANY_ID),
    );
    expect(point.cancellation.windowDays.source).toBe('document');
    expect(point.cancellation.feeInsideAed.value).toBe(1500);
  });
});

describe('company file, history, audit and access in the seed (spec 4, 5.1, 5.3, 7.3)', () => {
  it('parses against the mock data schema, version and all', () => {
    const parsed = MockData.safeParse(JSON.parse(JSON.stringify(seed())));
    expect(parsed.success, parsed.error?.message).toBe(true);
    expect(seed().version).toBe(MOCK_VERSION);
  });

  it('fills every new group of the company file on all six companies', () => {
    for (const facts of seed().companies) {
      expect(facts.ownership, facts.id).toBeTruthy();
      expect(facts.outsidePeople, facts.id).toBeTruthy();
      expect(facts.status, facts.id).toEqual({ state: 'active' });
      expect(facts.tax.smallBusinessRelief, facts.id).toBeDefined();
      expect(facts.tax.auditRequired, facts.id).toBeDefined();
      expect(facts.cards.portalRegistration !== undefined, facts.id).toBe(true);
      expect(facts.identity.registeredOfficeId, facts.id).toMatch(/^of-/);
      for (const bank of facts.banks ?? []) {
        expect(bank.openedOn !== undefined && bank.signatories !== undefined, bank.id).toBe(true);
      }
      for (const activity of facts.identity.activities) {
        expect(activity.licenceVersion !== undefined, activity.code).toBe(true);
      }
    }
  });

  it('leaves some values not entered so the empty state shows', () => {
    const data = seed();
    const qasr = data.companies.find((company) => company.id === QASR_ID);
    const hamdan = data.companies.find((company) => company.id === HAMDAN_ID);
    expect(qasr?.ownership?.manager).toBeNull();
    expect(qasr?.cards.eSignatureCards).toBeNull();
    expect(qasr?.identity.firstTaxPeriod).toBeNull();
    expect(hamdan?.identity.licenceCategory).toBeNull();
    expect(hamdan?.ownership?.ubos).toBeNull();
  });

  it('points every registered office at an office of the same company', () => {
    const data = seed();
    for (const facts of data.companies) {
      const office = data.offices.find((entry) => entry.id === facts.identity.registeredOfficeId);
      expect(office?.companyId, facts.id).toBe(facts.id);
    }
  });

  it('records the advertising activity added on Noor Digital as an amendment', () => {
    const data = seed();
    const noor = data.companies.find((company) => company.id === DEMO_COMPANY_ID);
    const advertising = noor?.identity.activities.find((activity) => activity.code === '7310');
    expect(advertising?.licenceVersion?.issuedOn).toBe(advertising?.addedOn);
    const entry = data.history.find(
      (item) => item.companyId === DEMO_COMPANY_ID && item.fieldPath === 'identity.activities',
    );
    expect(entry?.kind).toBe('amendment');
    const kinds = new Set(data.history.map((item) => item.kind));
    expect([...kinds].sort()).toEqual(['amendment', 'correction', 'created', 'from-document']);
  });

  it('holds a trail with ticks, references, reminders by email and push, and a replacement', () => {
    const data = seed();
    const kinds = new Set(data.audit.map((event) => event.kind));
    for (const kind of [
      'step-ticked',
      'reference-logged',
      'reminder-sent',
      'access-changed',
      'field-changed',
      'document-added',
      'document-replaced',
    ] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    const channels = new Set(data.audit.map((event) => event.channel).filter(Boolean));
    expect([...channels].sort()).toEqual(['email', 'push']);
    const replaced = data.audit.find((event) => event.kind === 'document-replaced');
    const policy = data.documents.find((document) => document.id === replaced?.documentId);
    expect(policy?.version).toBe(2);
    expect(policy?.previousVersions?.[0]?.version).toBe(1);
    for (const company of data.companies) {
      expect(
        data.audit.some((event) => event.companyId === company.id),
        company.id,
      ).toBe(true);
    }
    expect(new Set(data.audit.map((event) => event.id)).size).toBe(data.audit.length);
  });

  it('links trail lines only to cards, documents and people that exist', async () => {
    const data = seed();
    const cardIds = new Set([...(await allCards()), ...data.cards].map((card) => card.id));
    const documentIds = new Set(data.documents.map((document) => document.id));
    const personIds = new Set(data.people.map((person) => person.id));
    for (const event of data.audit) {
      if (event.cardId != null) {
        expect(cardIds.has(event.cardId), event.cardId).toBe(true);
      }
      if (event.documentId != null) {
        expect(documentIds.has(event.documentId), event.documentId).toBe(true);
      }
      if (event.personId != null) {
        expect(personIds.has(event.personId), event.personId).toBe(true);
      }
    }
  });

  it('seeds a PRO on two companies with people assigned, an accountant on three, a manager on one', () => {
    const data = seed();
    const byId = (id: string) => data.access.find((grant) => grant.id === id);
    const pro = byId('ag-demo-pro');
    expect(pro?.companies).toHaveLength(2);
    for (const entry of pro?.companies ?? []) {
      expect(entry.areas.documents?.level).toBe('view');
      expect(entry.areas.people?.level).toBe('edit');
    }
    expect(data.people.filter((person) => person.assigneeId === 'ag-demo-pro').length).toBe(4);
    const accountant = byId('ag-demo-accountant');
    expect(accountant?.companies).toHaveLength(3);
    for (const entry of accountant?.companies ?? []) {
      expect(entry.areas['tax-and-accounts']?.level).toBe('edit');
      expect(entry.areas.documents?.level).toBe('view');
    }
    expect(byId('ag-demo-manager')?.companies).toHaveLength(1);
  });
});
