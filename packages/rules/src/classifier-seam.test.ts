import { describe, expect, it } from 'vitest';
import { FEDERAL } from './testing/federal';
import { authorityFileClassifier, type RequirementClassifierLike } from './applies';
import { computeCards } from './cards';
import { requirementId } from './requirements';
import { TODAY, srtipAuthority, srtipFacts } from './testing/fixtures';

// Build plan section 4: the Brain replaces the classifier per company without touching the card
// computation. A classifier that names one requirement yields its cards and no other.
describe('the classifier seam', () => {
  const base = {
    facts: srtipFacts(),
    offices: [],
    people: [],
    documents: [],
    existingCards: [],
    authority: srtipAuthority({}),
    today: TODAY,
    federal: FEDERAL,
    holidays: [],
  };

  it('defaults to the authority file classifier', () => {
    const byDefault = computeCards(base);
    const explicit = computeCards({ ...base, classifier: authorityFileClassifier });
    expect(explicit.map((card) => card.id)).toEqual(byDefault.map((card) => card.id));
    expect(byDefault.length).toBeGreaterThan(0);
  });

  it('lets another classifier decide which requirements apply', () => {
    const onlyLicence: RequirementClassifierLike = {
      classify: () => [{ requirementId: requirementId('licence-renewal'), applicability: 'yes' }],
      applicableRequirements: () => [requirementId('licence-renewal')],
    };
    const cards = computeCards({ ...base, classifier: onlyLicence });
    expect(cards.length).toBeGreaterThan(0);
    expect(new Set(cards.map((card) => card.requirementId))).toEqual(new Set(['licence-renewal']));
  });

  it('keeps an unknown decision as a card, never dropped', () => {
    const unsure: RequirementClassifierLike = {
      classify: () => [
        { requirementId: requirementId('licence-renewal'), applicability: 'unknown' },
      ],
      applicableRequirements: () => [requirementId('licence-renewal')],
    };
    const cards = computeCards({ ...base, classifier: unsure });
    expect(cards.length).toBeGreaterThan(0);
    expect(new Set(cards.map((card) => card.requirementId))).toEqual(new Set(['licence-renewal']));
  });
});
