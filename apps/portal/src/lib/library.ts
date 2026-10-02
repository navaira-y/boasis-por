import { findRequirement } from '@boasis/rules';
import type { AuthorityFile, CompanyFacts, Person } from '@boasis/schema';
import { familyOf } from '../components/Dial/families';
import type { LibraryEntry } from '../content/content';

// Lite's shelves are the dial's families, so a guide carries the same name as the dates it
// explains. An entry's shelf is the area of its matching card; the four entries with no card
// (spec 8.2) sit on the getting-started shelf.
export type Topic = 'licence' | 'tax' | 'people' | 'other';
export const TOPICS: readonly Topic[] = ['licence', 'tax', 'people', 'other'];

// Four card ids in content/library name a requirement by a different key than packages/rules uses.
// Until the two are aligned, the shelf reads them through this table.
const CARD_ALIASES: Readonly<Record<string, string>> = {
  'licence-amendment': 'activity-change',
  'company-cancellation': 'cancellation-certificate',
  'emiratisation-targets': 'emiratisation',
  wages: 'wages-pay-date',
};

export function topicOf(entry: LibraryEntry): Topic {
  const cardId = entry.frontMatter.cardId;
  const requirement = findRequirement(CARD_ALIASES[cardId] ?? cardId);
  if (requirement === null) {
    return 'other';
  }
  // The dial calls the people shelf "visa"; the shelves keep lite's name.
  const family = familyOf(requirement.area, requirement.id);
  return family === 'visa' ? 'people' : family;
}

// Spec 8.1: the tag matches the rule the compliance card uses, read from the company's facts.
// A tag the facts cannot answer (a headcount or revenue threshold) does not apply.
export function appliesTo(
  entry: LibraryEntry,
  facts: CompanyFacts | null,
  people: readonly Person[],
  authority: AuthorityFile | null,
): boolean {
  if (facts === null) {
    return false;
  }
  return entry.frontMatter.appliesTo.every((tag) => {
    switch (tag) {
      case 'all-licensees':
        return true;
      case 'sponsors-visas':
        return people.length > 0;
      case 'vat-registered':
        return facts.tax.vat.status === 'registered';
      case 'mainland':
        return authority?.identity.type.value === 'mainland';
      default:
        return false;
    }
  });
}

// Lite's fold: lower case and stripped of accents, so a phone keyboard finds what it typed.
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function entryText(entry: LibraryEntry): string {
  return [entry.frontMatter.title, entry.summary, entry.body].join(' ');
}

export function sourceCount(entry: LibraryEntry): number {
  return (entry.body.match(/https?:\/\//g) ?? []).length;
}
