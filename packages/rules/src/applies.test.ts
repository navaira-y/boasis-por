import { describe, expect, it } from 'vitest';
import {
  activityChangeOpen,
  amlApplies,
  applicableRequirements,
  auditRequired,
  authorityFileClassifier,
  classifyRequirements,
  currentDecision,
  ejariRequired,
  emiratisationApplies,
  evaluateApplies,
  hasSponsoredPeople,
  ownershipChangeOpen,
  sectorPermitCodes,
  wpsApplies,
} from './applies';
import { requirementId } from './requirements';
import {
  emptyAuthority,
  mainlandAuthority,
  mainlandFacts,
  person,
  srtipAuthority,
  srtipFacts,
} from './testing/fixtures';

const srtip = srtipAuthority();
const mainland = mainlandAuthority();
const empty = emptyAuthority('srtip');
const emptyMainland = emptyAuthority('dubai-mainland');

// A company with no documents and no answers, so the file alone speaks (build plan 3A).
function under(authority: ReturnType<typeof srtipAuthority>) {
  return { facts: srtipFacts(), authority };
}

describe('file flags', () => {
  it('reads yes, no and unknown from the file', () => {
    expect(auditRequired(under(mainland))).toBe('yes');
    expect(auditRequired(under(srtip))).toBe('no');
    expect(auditRequired(under(empty))).toBe('unknown');
    expect(ejariRequired(under(mainland))).toBe('yes');
    expect(ejariRequired(under(empty))).toBe('unknown');
  });

  it('falls back to the licence prerequisites for the audit', () => {
    const viaLicence = srtipAuthority({
      companyRequirements: {},
      licence: {
        prerequisites: {
          auditRequired: { value: true, source: 't', lastChecked: '2026-09-12', grade: 'reported' },
        },
      },
    });
    expect(auditRequired(under(viaLicence))).toBe('yes');
  });

  it('settles WPS from the file, the mainland, a person, or not at all', () => {
    const context = { facts: srtipFacts(), offices: [], people: [], authority: srtip };
    expect(wpsApplies(context)).toBe('no');
    expect(wpsApplies({ ...context, authority: mainland })).toBe('yes');
    expect(wpsApplies({ ...context, authority: emptyMainland })).toBe('yes');
    expect(wpsApplies({ ...context, authority: empty })).toBe('unknown');
    const underWps = person('co-srtip', 'p', { pay: { underWps: true } });
    expect(wpsApplies({ ...context, authority: empty, people: [underWps] })).toBe('yes');
  });

  it('keeps Emiratisation a mainland question', () => {
    expect(emiratisationApplies(mainland)).toBe('yes');
    expect(emiratisationApplies(srtip)).toBe('no');
    expect(emiratisationApplies(emptyMainland)).toBe('unknown');
    expect(emiratisationApplies(empty)).toBe('no');
  });

  it('matches AML and sector permits on the active activities', () => {
    expect(amlApplies(mainlandFacts(), mainland)).toBe('no');
    const aml = mainlandFacts({
      identity: {
        activities: [{ code: '6820', name: 'Real estate', addedOn: '2024-03-01', removedOn: null }],
      },
    });
    expect(amlApplies(aml, mainland)).toBe('yes');
    expect(amlApplies(aml, emptyMainland)).toBe('unknown');
    const removed = mainlandFacts({
      identity: {
        activities: [
          { code: '6820', name: 'Real estate', addedOn: '2024-03-01', removedOn: '2025-01-01' },
        ],
      },
    });
    expect(amlApplies(removed, mainland)).toBe('no');
    expect(sectorPermitCodes(mainlandFacts(), mainland)).toEqual([]);
    expect(sectorPermitCodes(mainlandFacts(), emptyMainland)).toBeNull();
  });
});

describe('fact predicates', () => {
  it('counts only company-sponsored people', () => {
    expect(hasSponsoredPeople([])).toBe(false);
    expect(hasSponsoredPeople([person('co', 'p')])).toBe(true);
    expect(
      hasSponsoredPeople([
        person('co', 'p', { status: { sponsor: { kind: 'employee', personId: 'x' } } }),
      ]),
    ).toBe(false);
  });

  it('reads the decision for the current expiry only', () => {
    expect(currentDecision(srtipFacts())).toBeNull();
    const facts = srtipFacts({
      decision: { forExpiry: '2026-09-30', answer: 'cancel', thinkingOfClosing: null },
    });
    expect(currentDecision(facts)?.answer).toBe('cancel');
    const old = srtipFacts({
      decision: { forExpiry: '2025-09-30', answer: 'cancel', thinkingOfClosing: null },
    });
    expect(currentDecision(old)).toBeNull();
  });

  it('opens an ownership change until the UBO declaration catches up', () => {
    expect(ownershipChangeOpen(srtipFacts())).toBe(false);
    expect(ownershipChangeOpen(srtipFacts({ ubo: null }))).toBe(false);
    expect(ownershipChangeOpen(srtipFacts({ ubo: { lastOwnershipChangeOn: '2026-09-01' } }))).toBe(
      true,
    );
    expect(
      ownershipChangeOpen(
        srtipFacts({ ubo: { declaredOn: '2026-09-05', lastOwnershipChangeOn: '2026-09-01' } }),
      ),
    ).toBe(false);
    expect(
      ownershipChangeOpen(
        srtipFacts({ ubo: { declaredOn: null, lastOwnershipChangeOn: '2026-09-01' } }),
      ),
    ).toBe(true);
  });

  it('opens an activity change after the licence on file', () => {
    expect(activityChangeOpen(srtipFacts())).toBe(false);
    const added = srtipFacts({
      identity: {
        activities: [
          { code: '6201', name: 'Software', addedOn: '2025-10-01', removedOn: null },
          { code: '7310', name: 'Advertising', addedOn: '2026-03-15', removedOn: null },
        ],
      },
    });
    expect(activityChangeOpen(added)).toBe(true);
    const removed = srtipFacts({
      identity: {
        activities: [
          { code: '6201', name: 'Software', addedOn: '2025-10-01', removedOn: '2026-01-01' },
        ],
      },
    });
    expect(activityChangeOpen(removed)).toBe(true);
  });
});

describe('evaluateApplies', () => {
  const context = {
    facts: mainlandFacts(),
    offices: [],
    people: [person('co-mainland', 'p')],
    authority: mainland,
  };

  it('combines: no beats unknown beats yes', () => {
    expect(evaluateApplies({}, context)).toBe('yes');
    expect(evaluateApplies({ authorityType: 'free-zone' }, context)).toBe('no');
    expect(evaluateApplies({ authorityType: 'mainland', legalForm: ['llc'] }, context)).toBe('yes');
    expect(evaluateApplies({ authorityType: 'mainland', legalForm: ['fze'] }, context)).toBe('no');
    expect(evaluateApplies({ auditRequired: true }, { ...context, authority: emptyMainland })).toBe(
      'unknown',
    );
    expect(
      evaluateApplies(
        { auditRequired: true, vat: 'not-registered' },
        { ...context, authority: emptyMainland },
      ),
    ).toBe('no');
  });

  it('judges a person when given one, the company when not', () => {
    const partner = person('co-mainland', 'partner', { status: { type: 'partner' } });
    expect(evaluateApplies({ personType: ['partner'] }, context)).toBe('no');
    expect(evaluateApplies({ personType: ['partner'] }, { ...context, people: [partner] })).toBe(
      'yes',
    );
    expect(evaluateApplies({ personType: ['partner'] }, context, partner)).toBe('yes');
    expect(evaluateApplies({ hasSponsoredPeople: true }, { ...context, people: [] })).toBe('no');
    const family = person('co-mainland', 'f', {
      status: { sponsor: { kind: 'family', personId: null } },
    });
    expect(evaluateApplies({ hasSponsoredPeople: true }, context, family)).toBe('no');
  });

  it('reads tax facts and the decision', () => {
    expect(evaluateApplies({ vat: 'registered' }, context)).toBe('yes');
    expect(evaluateApplies({ corporateTaxRegistered: true }, context)).toBe('yes');
    expect(evaluateApplies({ decision: 'cancel' }, context)).toBe('no');
    expect(evaluateApplies({ event: true }, context)).toBe('yes');
  });
});

describe('applicableRequirements and the classifier', () => {
  it('drops what does not apply and keeps the unknown', () => {
    const ids = applicableRequirements(srtipFacts(), [], [], srtip);
    expect(ids).toContain(requirementId('licence-renewal'));
    expect(ids).toContain(requirementId('turnover-question'));
    expect(ids).not.toContain(requirementId('mohre-registration'));
    expect(ids).not.toContain(requirementId('vat-return'));
    expect(ids).not.toContain(requirementId('audited-accounts'));

    const withEmptyFile = classifyRequirements({
      facts: srtipFacts(),
      offices: [],
      people: [],
      authority: empty,
    });
    expect(
      withEmptyFile.find((entry) => entry.requirement.key === 'audited-accounts')?.applicability,
    ).toBe('unknown');
    expect(applicableRequirements(srtipFacts(), [], [], empty)).toContain(
      requirementId('audited-accounts'),
    );
  });

  it('implements the Brain seam with facts and the file only', () => {
    const ids = authorityFileClassifier.applicableRequirements(
      { facts: mainlandFacts(), offices: [], people: [], documents: [] },
      mainland,
    );
    expect(ids).toContain(requirementId('wages-pay-date'));
    expect(ids).toContain(requirementId('mohre-card-renewal'));
    expect(ids).not.toContain(requirementId('visa-stages'));
    expect(ids).toEqual(applicableRequirements(mainlandFacts(), [], [], mainland));
  });
});
