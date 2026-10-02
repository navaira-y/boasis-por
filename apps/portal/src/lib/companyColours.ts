import { stableHash } from '../components/shared/hash';

// The one company palette (the CEO instruction on company colours). Every company wears one of
// these, on the dial, in the legend and in its list rows. A colour is stored on the company as
// its index here (brand.colourSlot), never as a hex, so no one can pick a colour that breaks the
// rule below. tokens.css carries the same values as --company-0 to --company-6, light and dark;
// companyColours.test.ts checks that both agree.
//
// The rule, enforced by that test: in both themes, each colour's OKLCH hue is at least 28
// degrees from every orbit colour (tax gold, visa purple, licence teal) and from the late red
// and the soon amber, its chroma is at least 0.08 (never grey, so never the grey of Other), and
// the colours are at least 24 degrees apart from each other. Seven is the most that fits: the
// hues left free by those references are 101 to 181, 237 to 258 and 320 to 357.
export interface CompanyColour {
  readonly name: string;
  readonly light: string;
  readonly dark: string;
}

export const COMPANY_COLOURS: readonly CompanyColour[] = [
  { name: 'Blue', light: '#237fc8', dark: '#6ab1f3' },
  { name: 'Green', light: '#129253', dark: '#5bd38b' },
  { name: 'Magenta', light: '#a646ad', dark: '#da87de' },
  { name: 'Olive', light: '#8b840b', dark: '#ccc33c' },
  { name: 'Pink', light: '#d24e93', dark: '#f38abc' },
  { name: 'Jade', light: '#009581', dark: '#4cd0b8' },
  { name: 'Lime', light: '#61911c', dark: '#99d352' },
];

export function isColourSlot(slot: number | null | undefined): slot is number {
  return (
    slot !== null &&
    slot !== undefined &&
    Number.isInteger(slot) &&
    slot >= 0 &&
    slot < COMPANY_COLOURS.length
  );
}

// The CSS value of a palette colour: its token, so the theme decides light or dark.
export function colourVar(slot: number): string {
  return `var(--company-${String(slot)})`;
}

// The colour a company wears: the key stored on it, else one picked from its id so a company
// saved before colours existed still has one.
export function colourSlotOf(company: {
  readonly id: string;
  readonly brand?: { readonly colourSlot: number | null } | null;
}): number {
  const stored = company.brand?.colourSlot;
  return isColourSlot(stored) ? stored : stableHash(company.id) % COMPANY_COLOURS.length;
}

// The colour preselected for a new company: the first one no other company of the owner wears.
// When all are worn, the first.
export function firstFreeSlot(taken: readonly number[]): number {
  const worn = new Set(taken);
  const free = COMPANY_COLOURS.findIndex((_, slot) => !worn.has(slot));
  return free === -1 ? 0 : free;
}
