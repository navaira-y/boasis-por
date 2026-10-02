import type { CompanyFacts } from '@boasis/schema';
import { colourSlotOf, colourVar } from './companyColours';

// The colour a company wears: the palette key the owner chose, else the one its id picks, so a
// company keeps its colour on every device.
export function companyColourSlot(facts: CompanyFacts): number {
  return colourSlotOf(facts);
}

export function companyColour(facts: CompanyFacts): string {
  return colourVar(companyColourSlot(facts));
}

export function companyLogo(facts: CompanyFacts): string | null {
  const logo = facts.brand?.logoDataUrl ?? null;
  return logo === null || logo === '' ? null : logo;
}
