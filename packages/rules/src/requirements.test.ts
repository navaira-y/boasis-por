import type { Card } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { FEDERAL } from './testing/federal';
import { applicableRequirements } from './applies';
import { computeCards, type ComputeCardsInput } from './cards';
import {
  REQUIREMENTS,
  REQUIREMENT_KEYS,
  requirementByKey,
  requirementId,
  findRequirement,
  type RequirementKey,
} from './requirements';
import {
  TODAY,
  card,
  document,
  flexiDesk,
  mainlandAuthority,
  mainlandFacts,
  mainlandOffice,
  newHire,
  person,
  srtipAuthority,
  srtipFacts,
} from './testing/fixtures';

describe('the catalogue', () => {
  it('has one entry per key, in the order of spec 11', () => {
    expect(REQUIREMENTS.map((requirement) => requirement.key)).toEqual([...REQUIREMENT_KEYS]);
    expect(new Set(REQUIREMENTS.map((requirement) => requirement.id)).size).toBe(
      REQUIREMENTS.length,
    );
  });

  it('never carries a penalty (spec 11: fines are not a feature)', () => {
    for (const requirement of REQUIREMENTS) {
      expect(requirement.penaltyNote).toBeNull();
    }
  });

  it('uses the default lead of 90 unless the spec says otherwise', () => {
    const short = REQUIREMENTS.filter((requirement) => requirement.defaultLeadDays !== 90);
    expect(short.map((requirement) => [requirement.key, requirement.defaultLeadDays])).toEqual([
      ['rent-instalment', 7],
      ['owner-or-partner-visa', 7],
      ['mainland-llc-closing-prompt', 180],
      ['wages-pay-date', 7],
      ['visa-stages', 7],
      ['dependant-sponsorship', 7],
    ]);
  });

  it('tags the rows the spec marks verify or reported', () => {
    const reported = REQUIREMENTS.filter((requirement) => requirement.grade === 'reported').map(
      (requirement) => requirement.key,
    );
    expect(reported).toEqual([
      'immigration-card',
      'general-assembly',
      'bank-kyc-refresh',
      'emiratisation',
      'labour-contract-registered',
      'unemployment-insurance',
      'quota-increase',
      'resolution-and-liquidator',
      'vat-deregistration',
      'corporate-tax-deregistration',
    ]);
  });

  it('keeps the MVP 1 minimum of spec 18.2 and defers what 18.3 names', () => {
    const later = REQUIREMENTS.filter((requirement) => requirement.mvp === 2).map(
      (requirement) => requirement.key,
    );
    expect(later).toContain('emiratisation');
    expect(later).toContain('aml-registration');
    expect(later).toContain('general-assembly');
    expect(later).toContain('end-of-service-accrual');
    expect(later).not.toContain('licence-renewal');
    expect(later).not.toContain('wages-pay-date');
    expect(later).not.toContain('bank-kyc-refresh');
  });

  it('places each card in its access area (spec 7)', () => {
    expect(requirementByKey('office-lease-renewal').area).toBe('licence-and-cards');
    expect(requirementByKey('ubo-declaration').area).toBe('licence-and-cards');
    expect(requirementByKey('aml-registration').area).toBe('licence-and-cards');
    expect(requirementByKey('health-insurance-renewal').area).toBe('people');
    expect(requirementByKey('wages-pay-date').area).toBe('people');
    expect(requirementByKey('general-assembly').area).toBe('tax-and-accounts');
    expect(requirementByKey('bank-kyc-refresh').area).toBe('banks');
  });

  it('looks requirements up by key and by id', () => {
    expect(findRequirement('licence-renewal')?.key).toBe('licence-renewal');
    expect(findRequirement('not-a-requirement')).toBeNull();
    expect(requirementId('licence-renewal')).toBe('licence-renewal');
  });
});

// One scenario per requirement: a company it appears for and one it does not. Every scenario runs
// through computeCards at MVP 2 so the whole catalogue is exercised.
type Scenario = Partial<ComputeCardsInput>;

interface RequirementCase {
  yes: Scenario;
  // Null for a requirement every company has (spec 11: the licence, the tax return, the decision).
  no: Scenario | null;
}

const srtip = srtipAuthority();
const mainland = mainlandAuthority();
const SRTIP = 'co-srtip';
const MAINLAND = 'co-mainland';

function run(scenario: Scenario): Card[] {
  return computeCards({
    facts: srtipFacts(),
    offices: [],
    people: [],
    documents: [],
    existingCards: [],
    authority: srtip,
    today: TODAY,
    federal: FEDERAL,
    holidays: [],
    mvp: 2,
    ...scenario,
  });
}

const onMainland: Scenario = { facts: mainlandFacts(), authority: mainland };
const cancelling = mainlandFacts({
  decision: { forExpiry: '2027-02-28', answer: 'cancel', thinkingOfClosing: true },
});

const cases: Record<RequirementKey, RequirementCase> = {
  // 11.1
  'immigration-card': { yes: { facts: srtipFacts({ cards: { immigrationCard: null } }) }, no: {} },
  'mohre-registration': {
    yes: { facts: mainlandFacts({ cards: { mohreCard: null } }), authority: mainland },
    no: {},
  },
  'zone-portal-registration': { yes: {}, no: null },
  'chamber-membership': { yes: onMainland, no: {} },
  'office-lease-and-ejari': {
    yes: { ...onMainland, offices: [mainlandOffice(MAINLAND, { lease: { ejari: null } })] },
    no: { offices: [flexiDesk(SRTIP)] },
  },
  'rent-instalment': {
    yes: { ...onMainland, offices: [mainlandOffice(MAINLAND)] },
    no: { offices: [flexiDesk(SRTIP)] },
  },
  'utilities-and-telecom': {
    yes: { offices: [flexiDesk(SRTIP)] },
    no: { ...onMainland, offices: [mainlandOffice(MAINLAND)] },
  },
  'bank-account': { yes: { facts: srtipFacts({ banks: [] }) }, no: {} },
  'corporate-tax-registration': {
    yes: { facts: srtipFacts({ tax: { corporateTax: { registered: false } } }) },
    no: {},
  },
  'vat-registration': {
    yes: { facts: srtipFacts({ tax: { vat: { status: 'unknown' } } }) },
    no: {},
  },
  'ubo-declaration': { yes: { facts: srtipFacts({ ubo: { declaredOn: null } }) }, no: {} },
  'company-stamp-and-signatory-letters': {
    yes: {},
    no: { documents: [document(SRTIP, 'doc-sig', { type: 'signatory-letter' })] },
  },
  'owner-or-partner-visa': {
    yes: { people: [newHire(SRTIP, 'pe-partner', { status: { type: 'partner' } })] },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  'health-insurance-policy': {
    yes: { people: [newHire(SRTIP, 'pe-new')] },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  'wps-registration': { yes: onMainland, no: {} },
  'financial-year-end-chosen': { yes: {}, no: null },
  'aml-registration': {
    yes: {
      facts: mainlandFacts({
        identity: {
          activities: [
            { code: '6820', name: 'Real estate', addedOn: '2024-03-01', removedOn: null },
          ],
        },
      }),
      authority: mainland,
    },
    no: onMainland,
  },
  'sector-permit': {
    yes: {
      facts: mainlandFacts({
        identity: {
          activities: [
            { code: '5610', name: 'Restaurant', addedOn: '2024-03-01', removedOn: null },
          ],
        },
      }),
      authority: mainland,
    },
    no: onMainland,
  },
  // 11.2
  'decision-point': { yes: {}, no: null },
  'mainland-llc-closing-prompt': { yes: onMainland, no: {} },
  'licence-renewal': { yes: {}, no: null },
  'immigration-card-renewal': {
    yes: {},
    no: { facts: srtipFacts({ cards: { immigrationCard: null } }) },
  },
  'mohre-card-renewal': { yes: onMainland, no: {} },
  'e-signature-card-renewal': {
    yes: {
      documents: [
        document(SRTIP, 'doc-esig', { type: 'e-signature-card', expiryDate: '2027-01-31' }),
      ],
    },
    no: {},
  },
  'chamber-renewal': { yes: onMainland, no: {} },
  'office-lease-renewal': { yes: { offices: [flexiDesk(SRTIP)] }, no: {} },
  'ejari-renewal': {
    yes: { ...onMainland, offices: [mainlandOffice(MAINLAND)] },
    no: { offices: [flexiDesk(SRTIP)] },
  },
  'audited-accounts': { yes: onMainland, no: {} },
  'corporate-tax-return': { yes: {}, no: null },
  'general-assembly': { yes: onMainland, no: {} },
  'send-licence-to-bank': {
    yes: {
      facts: srtipFacts({
        banks: [{ id: 'b', bankName: 'Bank', kycRefreshOn: null, licenceSentOn: null }],
      }),
    },
    no: {},
  },
  'bank-kyc-refresh': { yes: {}, no: { facts: srtipFacts({ banks: [] }) } },
  'health-insurance-renewal': { yes: { people: [person(SRTIP, 'pe-emp')] }, no: {} },
  emiratisation: { yes: onMainland, no: {} },
  'ubo-confirmation': { yes: {}, no: null },
  // 11.3
  'wages-pay-date': { yes: onMainland, no: {} },
  'vat-return': { yes: onMainland, no: {} },
  'turnover-question': { yes: {}, no: onMainland },
  'end-of-service-accrual': { yes: { people: [person(SRTIP, 'pe-emp')] }, no: {} },
  // 11.4
  'visa-stages': {
    yes: { people: [newHire(SRTIP, 'pe-new')] },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  'labour-contract-registered': {
    yes: { ...onMainland, people: [person(MAINLAND, 'pe-m', { status: { contractStart: null } })] },
    no: { people: [person(SRTIP, 'pe-emp', { status: { contractStart: null } })] },
  },
  'residency-completed': {
    yes: {
      people: [newHire(SRTIP, 'pe-new', { status: { stage: 'entry', entryDate: '2026-09-05' } })],
    },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  'unemployment-insurance': {
    yes: { ...onMainland, people: [person(MAINLAND, 'pe-m')] },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  'residence-visa-renewal': {
    yes: { people: [person(SRTIP, 'pe-emp')] },
    no: { people: [newHire(SRTIP, 'pe-new')] },
  },
  'emirates-id-renewal': {
    yes: { people: [person(SRTIP, 'pe-emp')] },
    no: { people: [newHire(SRTIP, 'pe-new')] },
  },
  'work-permit-renewal': {
    yes: {
      ...onMainland,
      people: [person(MAINLAND, 'pe-m', { status: { workPermitExpiry: '2027-11-19' } })],
    },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  'passport-expiry': { yes: { people: [person(SRTIP, 'pe-emp')] }, no: {} },
  'probation-end': {
    yes: { people: [person(SRTIP, 'pe-emp', { status: { probationEnd: '2026-05-31' } })] },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  'absence-abroad': {
    yes: { people: [person(SRTIP, 'pe-emp', { status: { lastExitDate: '2026-06-01' } })] },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  leaving: {
    yes: { people: [person(SRTIP, 'pe-emp', { status: { contractEnd: '2026-10-31' } })] },
    no: { people: [person(SRTIP, 'pe-emp')] },
  },
  'dependant-sponsorship': {
    yes: { people: [newHire(SRTIP, 'pe-dep', { status: { type: 'dependant' } })] },
    no: {
      people: [
        newHire(SRTIP, 'pe-dep', {
          status: { type: 'dependant', sponsor: { kind: 'employee', personId: 'pe-emp' } },
        }),
      ],
    },
  },
  // 11.5
  'ownership-change': {
    yes: {
      facts: srtipFacts({ ubo: { declaredOn: '2025-10-20', lastOwnershipChangeOn: '2026-09-01' } }),
    },
    no: {},
  },
  'manager-or-signatory-change': {
    yes: { existingCards: [card(SRTIP, 'manager-or-signatory-change')] },
    no: {},
  },
  'activity-change': {
    yes: {
      facts: srtipFacts({
        identity: {
          activities: [
            { code: '6201', name: 'Software', addedOn: '2025-10-01', removedOn: null },
            { code: '7310', name: 'Advertising', addedOn: '2026-03-15', removedOn: null },
          ],
        },
      }),
    },
    no: {},
  },
  'office-move': { yes: { existingCards: [card(SRTIP, 'office-move')] }, no: {} },
  'quota-increase': { yes: { existingCards: [card(SRTIP, 'quota-increase')] }, no: {} },
  // 11.6
  'resolution-and-liquidator': { yes: { facts: cancelling, authority: mainland }, no: onMainland },
  'cancel-employee-visas': {
    yes: { facts: cancelling, authority: mainland, people: [person(MAINLAND, 'pe-m')] },
    no: { ...onMainland, people: [person(MAINLAND, 'pe-m')] },
  },
  'cancel-partner-visas-and-cards': {
    yes: {
      facts: cancelling,
      authority: mainland,
      people: [person(MAINLAND, 'pe-p', { status: { type: 'partner' } })],
    },
    no: { facts: cancelling, authority: mainland, people: [person(MAINLAND, 'pe-m')] },
  },
  'vat-deregistration': {
    yes: { facts: cancelling, authority: mainland },
    no: {
      facts: srtipFacts({
        decision: { forExpiry: '2026-09-30', answer: 'cancel', thinkingOfClosing: null },
      }),
    },
  },
  'corporate-tax-deregistration': {
    yes: { facts: cancelling, authority: mainland },
    no: {
      facts: srtipFacts({
        tax: { corporateTax: { registered: false } },
        decision: { forExpiry: '2026-09-30', answer: 'cancel', thinkingOfClosing: null },
      }),
    },
  },
  clearances: { yes: { facts: cancelling, authority: mainland }, no: onMainland },
  'hand-back-office': {
    yes: { facts: cancelling, authority: mainland, offices: [mainlandOffice(MAINLAND)] },
    no: { ...onMainland, offices: [mainlandOffice(MAINLAND)] },
  },
  'close-bank-account': { yes: { facts: cancelling, authority: mainland }, no: onMainland },
  'cancellation-certificate': { yes: { facts: cancelling, authority: mainland }, no: onMainland },
};

// The two rows that live on the licence card (spec 7.1) and the one the file always satisfies.
const NO_CARD_OF_ITS_OWN: readonly RequirementKey[] = [
  'decision-point',
  'mainland-llc-closing-prompt',
  'financial-year-end-chosen',
];

function has(cards: readonly Card[], key: RequirementKey): boolean {
  return cards.some((entry) => entry.requirementId === requirementId(key));
}

function applies(scenario: Scenario, key: RequirementKey): boolean {
  const facts = scenario.facts ?? srtipFacts();
  const authority = scenario.authority ?? srtip;
  return applicableRequirements(
    facts,
    scenario.offices ?? [],
    scenario.people ?? [],
    authority,
  ).includes(requirementId(key));
}

describe('every requirement appears for a matching company and not for a non-matching one', () => {
  for (const key of REQUIREMENT_KEYS) {
    const entry = cases[key];
    it(`${key} appears`, () => {
      expect(applies(entry.yes, key)).toBe(true);
      if (!NO_CARD_OF_ITS_OWN.includes(key)) {
        expect(has(run(entry.yes), key)).toBe(true);
      }
    });
    if (entry.no !== null) {
      const absent = entry.no;
      it(`${key} does not appear`, () => {
        expect(has(run(absent), key)).toBe(false);
      });
    }
  }

  it('folds the decision rows into the licence card and never emits a year-end card', () => {
    for (const key of NO_CARD_OF_ITS_OWN) {
      expect(has(run({ ...onMainland }), key)).toBe(false);
    }
  });
});
