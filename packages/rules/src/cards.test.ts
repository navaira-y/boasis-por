import type { Card } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { FEDERAL } from './testing/federal';
import { known, notSure } from './testing/fields';
import { cardId, computeCards, type ComputeCardsInput } from './cards';
import { requirementId, type RequirementKey } from './requirements';
import {
  TODAY,
  card,
  document,
  emptyAuthority,
  flexiDesk,
  mainlandAuthority,
  mainlandFacts,
  mainlandOffice,
  newHire,
  person,
  srtipAuthority,
  srtipFacts,
} from './testing/fixtures';

const SRTIP = 'co-srtip';
const MAINLAND = 'co-mainland';

// An SRTIP flexi-desk company with two people: one through the chain, one just hired.
function srtipCompany(overrides: Partial<ComputeCardsInput> = {}): ComputeCardsInput {
  return {
    facts: srtipFacts(),
    offices: [flexiDesk(SRTIP)],
    people: [
      person(SRTIP, 'pe-amina', { identity: { name: 'Amina Khan' } }),
      newHire(SRTIP, 'pe-omar', { identity: { name: 'Omar Haddad' } }),
    ],
    documents: [document(SRTIP, 'doc-licence')],
    existingCards: [],
    authority: srtipAuthority(),
    today: TODAY,
    federal: FEDERAL,
    holidays: [],
    ...overrides,
  };
}

// A Dubai mainland LLC with an office lease on instalments, an employee and a partner.
function mainlandCompany(overrides: Partial<ComputeCardsInput> = {}): ComputeCardsInput {
  return {
    facts: mainlandFacts(),
    offices: [mainlandOffice(MAINLAND)],
    people: [
      person(MAINLAND, 'pe-khalid', {
        identity: { name: 'Khalid Rahman', emirateOfWork: 'Dubai' },
        status: { workPermitExpiry: '2027-11-19' },
        cover: {
          unemploymentInsurance: {
            certificateNumber: 'UI-1',
            validUntil: '2027-01-31',
            duesOutstanding: false,
          },
        },
      }),
      person(MAINLAND, 'pe-owner', {
        identity: { name: 'Layla Owner', emirateOfWork: 'Dubai', role: 'Partner' },
        status: { type: 'partner', contractStart: null, contractType: null },
      }),
    ],
    documents: [
      document(MAINLAND, 'doc-licence', { issueDate: '2024-03-01', expiryDate: '2027-02-28' }),
      document(MAINLAND, 'doc-audit', {
        type: 'audited-accounts',
        issueDate: '2026-03-15',
        expiryDate: null,
      }),
    ],
    existingCards: [],
    authority: mainlandAuthority(),
    today: TODAY,
    federal: FEDERAL,
    holidays: [],
    ...overrides,
  };
}

function byKey(cards: readonly Card[], key: RequirementKey): Card[] {
  return cards.filter((entry) => entry.requirementId === requirementId(key));
}

function one(cards: readonly Card[], key: RequirementKey, subjectId: string | null = null): Card {
  const found = byKey(cards, key).find((entry) => (entry.subjectId ?? null) === subjectId);
  if (found === undefined) {
    throw new Error(`no card ${key} for ${subjectId ?? 'the company'}`);
  }
  return found;
}

describe('an SRTIP flexi-desk company with two people', () => {
  const cards = computeCards(srtipCompany());

  it('matches the snapshot', () => {
    expect(cards).toMatchSnapshot();
  });

  it('shows the licence, card and lease expiring together with the decision open', () => {
    expect(one(cards, 'licence-renewal').state).toBe('expiring');
    expect(one(cards, 'licence-renewal').dueOn).toBe('2026-09-30');
    expect(one(cards, 'immigration-card-renewal').state).toBe('expiring');
    expect(one(cards, 'office-lease-renewal', 'co-srtip-office').state).toBe('expiring');
  });

  it('skips what the facts show is done (spec 5.6) and what the file rules out', () => {
    for (const key of [
      'immigration-card',
      'bank-account',
      'corporate-tax-registration',
      'ubo-declaration',
      'send-licence-to-bank',
      'mohre-registration',
      'ejari-renewal',
      'audited-accounts',
      'wages-pay-date',
      'vat-return',
    ] as const) {
      expect(byKey(cards, key)).toEqual([]);
    }
  });

  it('follows each person', () => {
    expect(byKey(cards, 'visa-stages').map((entry) => entry.subjectId)).toEqual(['pe-omar']);
    const omar = one(cards, 'visa-stages', 'pe-omar');
    expect(omar.dueOn).toBe('2026-11-01');
    // Still at the entry permit: the missing policy is two stages ahead, so the chain is not
    // blocked and fifty days out is not action soon. The policy card below asks for it.
    expect(omar.state).toBe('on-track');
    expect(one(cards, 'health-insurance-policy', 'pe-omar').state).toBe('action-soon');
    expect(one(cards, 'health-insurance-renewal', 'pe-amina').dueOn).toBe('2026-11-19');
    expect(one(cards, 'residence-visa-renewal', 'pe-amina').state).toBe('on-track');
    expect(byKey(cards, 'passport-expiry')).toHaveLength(2);
  });

  it('asks the turnover question for the quarter that ended', () => {
    const question = one(cards, 'turnover-question');
    expect(question.dueOn).toBe('2026-06-30');
    expect(question.state).toBe('overdue');
  });

  it('is deterministic with stable ids', () => {
    const again = computeCards(srtipCompany());
    expect(again).toEqual(cards);
    expect(cards.map((entry) => entry.id)).toEqual([...cards.map((entry) => entry.id)].sort());
    expect(one(cards, 'licence-renewal').id).toBe('licence-renewal:co-srtip:2026-09-30');
    expect(cardId('x', null, 'co', '2026-01-01')).toBe('x:co:2026-01-01');
  });
});

describe('a Dubai mainland LLC', () => {
  const cards = computeCards(mainlandCompany());

  it('matches the snapshot', () => {
    expect(cards).toMatchSnapshot();
  });

  it('shows decision needed on the licence card from the 180-day prompt', () => {
    const licence = one(cards, 'licence-renewal');
    expect(licence.state).toBe('decision-needed');
    expect(licence.dueOn).toBe('2027-02-28');
    expect(byKey(cards, 'decision-point')).toEqual([]);
    expect(byKey(cards, 'mainland-llc-closing-prompt')).toEqual([]);
  });

  it('tracks every rent instalment on the short schedule', () => {
    const rent = byKey(cards, 'rent-instalment');
    expect(rent.map((entry) => [entry.dueOn, entry.state])).toEqual([
      ['2026-04-01', 'overdue'],
      ['2026-07-01', 'overdue'],
      ['2026-10-01', 'expiring'],
      ['2027-01-01', 'on-track'],
    ]);
    expect(rent[0]?.id).toBe('rent-instalment:co-mainland-office:2026-04-01');
  });

  it('computes the tax cards from the period ends', () => {
    expect(one(cards, 'corporate-tax-return').dueOn).toBe('2026-09-30');
    expect(one(cards, 'vat-return').dueOn).toBe('2026-07-28');
    expect(one(cards, 'vat-return').state).toBe('overdue');
    expect(one(cards, 'wages-pay-date').dueOn).toBe('2026-09-01');
    expect(byKey(cards, 'audited-accounts')).toEqual([]);
    expect(byKey(cards, 'turnover-question')).toEqual([]);
  });

  it('follows the mainland people', () => {
    expect(byKey(cards, 'visa-stages')).toEqual([]);
    expect(byKey(cards, 'owner-or-partner-visa')).toEqual([]);
    expect(one(cards, 'work-permit-renewal', 'pe-khalid').dueOn).toBe('2027-11-19');
    expect(one(cards, 'unemployment-insurance', 'pe-khalid').state).toBe('on-track');
    expect(byKey(cards, 'unemployment-insurance').map((entry) => entry.subjectId)).toEqual([
      'pe-khalid',
    ]);
    expect(one(cards, 'mohre-card-renewal').dueOn).toBe('2027-02-28');
    expect(one(cards, 'ejari-renewal', 'co-mainland-office').dueOn).toBe('2027-03-31');
  });

  it('adds the MVP 2 cards only when asked', () => {
    const later = computeCards(mainlandCompany({ mvp: 2 }));
    expect(later.length).toBeGreaterThan(cards.length);
    expect(byKey(later, 'general-assembly')[0]?.dueOn).toBe('2026-04-30');
    expect(byKey(later, 'emiratisation')[0]?.state).toBe('unknown');
    expect(byKey(later, 'chamber-renewal')).toHaveLength(1);
    expect(byKey(cards, 'general-assembly')).toEqual([]);
  });
});

describe('prerequisites (spec 7.1, 7.2)', () => {
  it('turns the licence card action soon when the audit is missing, 100 days out', () => {
    const input = mainlandCompany({
      documents: [document(MAINLAND, 'doc-licence')],
      facts: mainlandFacts({
        identity: { expiryDate: '2026-12-21' },
        decision: { forExpiry: '2026-12-21', answer: 'renew', thinkingOfClosing: false },
      }),
    });
    expect(one(computeCards(input), 'licence-renewal').state).toBe('action-soon');
    expect(
      one(computeCards(mainlandCompany({ facts: input.facts })), 'licence-renewal').state,
    ).toBe('on-track');
  });

  it('turns the licence card action soon when the lease ends too close to the renewal', () => {
    const input = mainlandCompany({
      facts: mainlandFacts({
        identity: { expiryDate: '2027-03-15' },
        decision: { forExpiry: '2027-03-15', answer: 'renew', thinkingOfClosing: false },
      }),
    });
    expect(one(computeCards(input), 'licence-renewal').state).toBe('action-soon');
  });

  it('flags a visa renewal blocked by a short passport or lapsed cover', () => {
    const short = person(SRTIP, 'pe-short', { identity: { passportExpiry: '2026-12-01' } });
    const cards = computeCards(srtipCompany({ people: [short] }));
    expect(one(cards, 'residence-visa-renewal', 'pe-short').state).toBe('action-soon');
    expect(one(cards, 'passport-expiry', 'pe-short').state).toBe('action-soon');

    const lapsed = person(SRTIP, 'pe-lapsed', {
      cover: { healthInsurance: { policyNumber: 'P', endDate: '2026-09-01', paidBy: 'employer' } },
    });
    const lapsedCards = computeCards(srtipCompany({ people: [lapsed] }));
    expect(one(lapsedCards, 'residence-visa-renewal', 'pe-lapsed').state).toBe('action-soon');
    expect(one(lapsedCards, 'health-insurance-renewal', 'pe-lapsed').state).toBe('overdue');
  });

  it('turns the audited accounts card action soon after year end (spec 9A.1)', () => {
    const cards = computeCards(mainlandCompany({ documents: [] }));
    const audit = one(cards, 'audited-accounts');
    expect(audit.state).toBe('action-soon');
    expect(audit.dueOn).toBe('2027-02-28');
    expect(audit.id).toBe('audited-accounts:co-mainland:2025-12-31');
  });
});

describe('unknown (spec 7.1, 18.1)', () => {
  it('asks rather than drops when the file lacks a flag', () => {
    const cards = computeCards(srtipCompany({ authority: emptyAuthority('srtip') }));
    expect(one(cards, 'audited-accounts').state).toBe('unknown');
    expect(one(cards, 'wages-pay-date').state).toBe('unknown');
    expect(one(cards, 'office-lease-and-ejari', 'co-srtip-office').state).toBe('unknown');
  });

  it('asks for the facts the person has not entered', () => {
    const facts = srtipFacts({
      tax: { vat: { status: 'unknown' } },
      banks: null,
      ubo: null,
    });
    const cards = computeCards(
      srtipCompany({
        facts,
        people: [person(SRTIP, 'pe-nopass', { identity: { passportExpiry: null } })],
      }),
    );
    expect(one(cards, 'vat-registration').state).toBe('unknown');
    expect(one(cards, 'bank-account').state).toBe('unknown');
    expect(one(cards, 'ubo-declaration').state).toBe('unknown');
    expect(one(cards, 'passport-expiry', 'pe-nopass').state).toBe('unknown');
    expect(byKey(cards, 'turnover-question')).toEqual([]);

    const registered = srtipFacts({
      tax: { vat: { status: 'registered', trn: 'T', periodEnd: null } },
    });
    expect(one(computeCards(srtipCompany({ facts: registered })), 'vat-return').state).toBe(
      'unknown',
    );
  });
});

describe('existing cards (spec 7.3)', () => {
  it('carries the responsible person, steps and evidence, and keeps a closed card closed', () => {
    const existing = card(SRTIP, 'licence-renewal', {
      id: 'licence-renewal:co-srtip:2026-09-30',
      dueOn: '2026-09-30',
      state: 'complete',
      responsibleId: 'ag-pro',
      steps: [
        {
          id: 'st-1',
          title: 'Upload the new licence',
          done: true,
          doneOn: '2026-09-10',
          assigneeId: null,
        },
      ],
      evidence: [{ kind: 'reference', reference: 'REN-1', date: '2026-09-10' }],
    });
    const cards = computeCards(srtipCompany({ existingCards: [existing] }));
    const licence = one(cards, 'licence-renewal');
    expect(licence.state).toBe('complete');
    expect(licence.responsibleId).toBe('ag-pro');
    expect(licence.steps).toHaveLength(1);
    expect(licence.evidence).toHaveLength(1);
  });

  it('keeps the steps of the open card when a date is corrected', () => {
    const existing = card(SRTIP, 'licence-renewal', {
      id: 'licence-renewal:co-srtip:2026-09-30',
      dueOn: '2026-09-30',
      state: 'expiring',
      responsibleId: 'ag-pro',
      steps: [
        { id: 'st-1', title: 'Book the audit', done: true, doneOn: '2026-09-01', assigneeId: null },
      ],
    });
    const corrected = srtipFacts({ identity: { expiryDate: '2026-10-15' } });
    const licence = one(
      computeCards(srtipCompany({ facts: corrected, existingCards: [existing] })),
      'licence-renewal',
    );
    expect(licence.id).toBe('licence-renewal:co-srtip:2026-10-15');
    expect(licence.responsibleId).toBe('ag-pro');
    expect(licence.steps.map((step) => step.title)).toEqual(['Book the audit']);
  });

  it('rolls a period requirement forward once its card is closed', () => {
    const closed = card(MAINLAND, 'wages-pay-date', {
      id: 'wages-pay-date:co-mainland:2026-09-01',
      dueOn: '2026-09-01',
      state: 'complete',
    });
    const wages = one(computeCards(mainlandCompany({ existingCards: [closed] })), 'wages-pay-date');
    expect(wages.dueOn).toBe('2026-10-01');
    expect(wages.state).toBe('expiring');
  });

  it('shows a closed one-off card as complete rather than dropping it', () => {
    const closed = card(SRTIP, 'health-insurance-policy', {
      id: 'health-insurance-policy:pe-omar:open',
      subjectId: 'pe-omar',
      state: 'complete',
    });
    expect(
      one(
        computeCards(srtipCompany({ existingCards: [closed] })),
        'health-insurance-policy',
        'pe-omar',
      ).state,
    ).toBe('complete');
  });

  it('keeps event cards the app opened and judges their date', () => {
    const move = card(SRTIP, 'office-move', {
      id: 'office-move:co-srtip:2026-09-01',
      dueOn: '2026-09-01',
    });
    const quota = card(SRTIP, 'quota-increase', { id: 'quota-increase:co-srtip:open' });
    const stale = card(SRTIP, 'licence-renewal', {
      id: 'licence-renewal:co-srtip:2020-01-01',
      dueOn: '2020-01-01',
    });
    const cards = computeCards(srtipCompany({ existingCards: [move, quota, stale] }));
    expect(one(cards, 'office-move').state).toBe('overdue');
    expect(one(cards, 'office-move').actBy).toBe('2026-09-01');
    expect(one(cards, 'quota-increase').state).toBe('action-soon');
    expect(byKey(cards, 'licence-renewal')).toHaveLength(1);
  });
});

describe('act-by dates and weekends (spec 7.1)', () => {
  it('moves a weekend or holiday due date to the last working day', () => {
    // 2026-11-01 is a Sunday; 2026-11-19 is a Thursday.
    const cards = computeCards(srtipCompany({ holidays: ['2026-11-19'] }));
    expect(one(cards, 'visa-stages', 'pe-omar').actBy).toBe('2026-10-30');
    expect(one(cards, 'health-insurance-renewal', 'pe-amina').actBy).toBe('2026-11-18');
    expect(one(cards, 'health-insurance-policy', 'pe-omar').actBy).toBeNull();
  });
});

describe('changes and exit (spec 11.5, 11.6, 10)', () => {
  it('opens the UBO update 15 days after an ownership change', () => {
    const facts = srtipFacts({
      ubo: { declaredOn: '2025-10-20', lastOwnershipChangeOn: '2026-09-01' },
    });
    const change = one(computeCards(srtipCompany({ facts })), 'ownership-change');
    expect(change.dueOn).toBe('2026-09-16');
    expect(change.state).toBe('expiring');
  });

  it('opens the amendment after a new activity', () => {
    const facts = srtipFacts({
      identity: {
        activities: [
          { code: '6201', name: 'Software', addedOn: '2025-10-01', removedOn: null },
          { code: '7310', name: 'Advertising', addedOn: '2026-03-15', removedOn: null },
        ],
      },
    });
    const change = one(computeCards(srtipCompany({ facts })), 'activity-change');
    expect(change.id).toBe('activity-change:co-srtip:2026-03-15');
    expect(change.state).toBe('action-soon');
  });

  it('opens the exit sequence when the answer is cancel', () => {
    const cancelling = mainlandFacts({
      decision: { forExpiry: '2027-02-28', answer: 'cancel', thinkingOfClosing: true },
    });
    const cards = computeCards(mainlandCompany({ facts: cancelling }));
    expect(one(cards, 'licence-renewal').state).toBe('on-track');
    expect(one(cards, 'resolution-and-liquidator').id).toBe(
      'resolution-and-liquidator:co-mainland:2027-02-28',
    );
    expect(byKey(cards, 'cancel-employee-visas').map((entry) => entry.subjectId)).toEqual([
      'pe-khalid',
    ]);
    expect(byKey(cards, 'cancel-partner-visas-and-cards').map((entry) => entry.subjectId)).toEqual([
      'pe-owner',
    ]);
    expect(one(cards, 'hand-back-office', 'co-mainland-office').state).toBe('action-soon');
    expect(one(cards, 'close-bank-account', 'bank-2').state).toBe('action-soon');
    for (const key of [
      'vat-deregistration',
      'corporate-tax-deregistration',
      'clearances',
      'cancellation-certificate',
    ] as const) {
      expect(one(cards, key).state).toBe('action-soon');
    }
  });
});

// Onboarding v2 section I: FTA Decision 3 of 2024 dates registration from incorporation only for
// companies incorporated on or after 1 March 2024; every earlier deadline fell in 2024.
describe('corporate tax registration card', () => {
  const unregistered = (incorporationDate: string) =>
    srtipFacts({
      identity: { incorporationDate },
      tax: { corporateTax: { registered: false } },
    });

  it('is overdue with no date for a company incorporated before 1 March 2024', () => {
    const late = one(
      computeCards(srtipCompany({ facts: unregistered('2023-06-15') })),
      'corporate-tax-registration',
    );
    expect(late.state).toBe('overdue');
    expect(late.dueOn).toBeNull();
    expect(late.actBy).toBeNull();
  });

  it('dates incorporation plus three months from 1 March 2024 on', () => {
    const due = one(
      computeCards(srtipCompany({ facts: unregistered('2026-08-01') })),
      'corporate-tax-registration',
    );
    expect(due.dueOn).toBe('2026-11-01');
    const passed = one(
      computeCards(srtipCompany({ facts: unregistered('2024-03-01') })),
      'corporate-tax-registration',
    );
    expect(passed).toMatchObject({ dueOn: '2024-06-01', state: 'overdue' });
  });

  it('reads the onboarding answers when they exist', () => {
    const base = unregistered('2023-06-15');
    const withAnswers = (registered: 'yes' | 'no' | null, incorporation: string | null) => ({
      ...base,
      profile: {
        licenceStatus: known('active' as const),
        licenceTermYears: known(1),
        incorporationDate: incorporation === null ? notSure<string>() : known(incorporation),
        website: notSure<string>(),
        handler: notSure<{ kind: 'self' }>(),
      },
      tax: {
        ...base.tax,
        corporateTaxRecord: {
          registered: registered === null ? notSure<'yes' | 'no'>() : known(registered),
          trn: null,
          firstTaxPeriodEnd: null,
          financialYearEnd: null,
          qfzpIntent: null,
        },
      },
    });
    const cards = (facts: ReturnType<typeof withAnswers>) =>
      byKey(computeCards(srtipCompany({ facts })), 'corporate-tax-registration');
    expect(cards(withAnswers('yes', '2023-06-15'))).toEqual([]);
    expect(cards(withAnswers(null, '2023-06-15'))[0]?.state).toBe('unknown');
    expect(cards(withAnswers('no', null))[0]?.state).toBe('unknown');
    expect(cards(withAnswers('no', '2026-08-01'))[0]?.dueOn).toBe('2026-11-01');
  });
});
