import { computeCards } from '@boasis/rules';
import { describe, expect, it } from 'vitest';
import { federalRules } from '../content/federal';
import { loadAuthority } from '../data/content';
import { ALREEF_ID, seed } from '../data/mock/seed';
import { entriesOf, type Bundle } from './entries';
import { today } from './today';

async function alReef(): Promise<Bundle> {
  const data = seed();
  const facts = data.companies.find((company) => company.id === ALREEF_ID);
  if (facts === undefined) {
    throw new Error('no Al Reef in the seed');
  }
  const mine = <T extends { companyId: string }>(list: readonly T[]) =>
    list.filter((entry) => entry.companyId === ALREEF_ID);
  const authority = await loadAuthority(facts.identity.authority);
  const offices = mine(data.offices);
  const people = mine(data.people);
  const documents = mine(data.documents);
  const stored = mine(data.cards);
  const cards = computeCards({
    facts,
    offices,
    people,
    documents,
    existingCards: stored,
    authority,
    federal: federalRules,
    today: today(),
    holidays: [],
  });
  return { facts, offices, people, documents, authority, cards, stored };
}

describe('entriesOf', () => {
  it('shows one row per person per date: the generic visa stages line gives way', async () => {
    const entries = entriesOf(await alReef(), today());
    const stages = entries.filter((entry) => entry.requirement?.key === 'visa-stages');
    for (const stage of stages) {
      const twins = entries.filter(
        (entry) =>
          entry !== stage &&
          entry.person?.id === stage.person?.id &&
          entry.date === stage.date &&
          entry.status === stage.status,
      );
      expect(twins).toEqual([]);
    }
    // The labour contract rows the stages line used to repeat are still there.
    expect(entries.some((entry) => entry.requirement?.key === 'labour-contract-registered')).toBe(
      true,
    );
  });

  it('subtitles a rent instalment with its premises, not as a first-days item', async () => {
    const bundle = await alReef();
    const instalments = entriesOf(bundle, today()).filter(
      (entry) => entry.requirement?.key === 'rent-instalment',
    );
    expect(instalments.length).toBeGreaterThan(0);
    const address = bundle.offices[0]?.premises.address ?? '';
    for (const entry of instalments) {
      expect(entry.subtitle).toBe(`Rent instalment · ${address}`);
    }
  });
});
