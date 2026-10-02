import type { Area } from '@boasis/schema';

// The four families of the dial, as the CEO set them: one orbit per family, each in its own
// colour, outermost to innermost. The position of a mark on the face says WHAT kind of date it
// is; the monogram inside it says WHOSE.
export type DialFamily = 'tax' | 'visa' | 'licence' | 'other';

export interface DialFamilyInfo {
  readonly id: DialFamily;
  readonly label: string;
}

export const DIAL_FAMILIES: readonly DialFamilyInfo[] = [
  { id: 'tax', label: 'Tax' },
  { id: 'visa', label: 'Visa' },
  { id: 'licence', label: 'Licence' },
  { id: 'other', label: 'Other' },
];

export function familyIndex(family: DialFamily): number {
  const at = DIAL_FAMILIES.findIndex((entry) => entry.id === family);
  return at === -1 ? DIAL_FAMILIES.length - 1 : at;
}

export function familyLabel(family: DialFamily): string {
  return DIAL_FAMILIES[familyIndex(family)]?.label ?? 'Other';
}

// The requirements that sit under "licence and cards" or "tax and accounts" in the spec but read as
// "other" on the dial: the office, the banks, the company records, the UBO register and AML.
const OTHER_REQUIREMENTS: ReadonlySet<string> = new Set([
  'office-lease-and-ejari',
  'rent-instalment',
  'utilities-and-telecom',
  'office-lease-renewal',
  'ejari-renewal',
  'office-move',
  'hand-back-office',
  'ubo-declaration',
  'ubo-confirmation',
  'ownership-change',
  'aml-registration',
  'general-assembly',
  'company-stamp-and-signatory-letters',
]);

// Which orbit a compliance card lands on. Tax and accounts is Tax; people is Visa; licence and
// cards is Licence; everything else (office, banks, records, UBO, AML) is Other. The mapping
// is total: every area and every requirement lands somewhere.
export function familyOf(area: Area, requirementId?: string): DialFamily {
  if (requirementId !== undefined && OTHER_REQUIREMENTS.has(requirementId)) {
    return 'other';
  }
  switch (area) {
    case 'people':
      return 'visa';
    case 'tax-and-accounts':
      return 'tax';
    case 'licence-and-cards':
      return 'licence';
    case 'banks':
    case 'offices':
    case 'company-file':
    case 'documents':
    case 'calendar-and-costs':
    case 'access':
    case 'billing':
      return 'other';
  }
}

// The emptiest angle on an orbit: the middle of the widest gap between the angles it already
// carries. Kept for a label that must never land on a mark.
export function quietAngle(angles: readonly number[]): number {
  if (angles.length === 0) {
    return 90;
  }
  const sorted = [...angles].sort((a, b) => a - b);
  let bestGap = -1;
  let bestAt = 90;
  for (let index = 0; index < sorted.length; index += 1) {
    const from = sorted[index] ?? 0;
    const next = sorted[index + 1];
    const to = next ?? (sorted[0] ?? 0) + 360;
    const gap = to - from;
    if (gap > bestGap) {
      bestGap = gap;
      bestAt = (from + gap / 2) % 360;
    }
  }
  return bestAt;
}
