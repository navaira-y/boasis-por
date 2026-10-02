import type {
  AuthorityFile,
  Card,
  CardState,
  CompanyFacts,
  Document,
  IsoDate,
  Office,
  Person,
} from '@boasis/schema';
import {
  ABSENCE_ABROAD_DAYS,
  daysUntil,
  findRequirement,
  GENERAL_ASSEMBLY_MONTHS,
  type Requirement,
} from '@boasis/rules';
import { initialsOf } from '../components/Avatar/Avatar';
import { federalRules } from '../content/federal';
import { familyOf, type DialFamily } from '../components/Dial/families';
import { en } from '../copy/en';
import { formatLong, plural } from './format';

// Everything the screens know about one company, loaded once: its file, its offices, people
// and documents, its authority, and the cards packages/rules computed from all of that.
export interface Bundle {
  readonly facts: CompanyFacts;
  readonly offices: readonly Office[];
  readonly people: readonly Person[];
  readonly documents: readonly Document[];
  readonly authority: AuthorityFile;
  // The cards as computed today.
  readonly cards: readonly Card[];
  // The cards as stored (ticks, evidence, steps), which computeCards read.
  readonly stored: readonly Card[];
}

export type EntryStatus = 'upcoming' | 'done';

// One dated card as a line on the dial, in the timeline and in a sheet: lite's "entry". The
// words come from the requirement catalogue; the number of days from packages/rules.
export interface Entry {
  readonly id: string;
  readonly card: Card;
  readonly requirement: Requirement | null;
  readonly company: CompanyFacts;
  readonly companyName: string;
  readonly monogram: string;
  readonly person: Person | null;
  readonly title: string;
  readonly subtitle: string;
  readonly family: DialFamily;
  readonly date: IsoDate;
  readonly days: number;
  readonly state: CardState;
  readonly status: EntryStatus;
}

// Two letters for a company's mark, from its trade name, as lite's avatar does.
export function monogramOf(name: string): string {
  return initialsOf(name);
}

// How a company is named in one line: the authority, then the emirate (lite's placeOf).
export function placeOf(authority: AuthorityFile): string {
  return [authority.identity.name.value, authority.identity.emirate.value]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}

// The short name people use, for a line that names several authorities at once: the acronym in
// the brackets when the index gives one ("DET", "DMCC", "JAFZA"), otherwise the name itself.
export function shortNameOf(authority: AuthorityFile): string {
  const name = authority.identity.name.value ?? '';
  const inside = /\(([^)]*)\)/.exec(name)?.[1];
  if (inside !== undefined) {
    const last =
      inside
        .split(',')
        .map((part) => part.trim())
        .at(-1) ?? '';
    if (/^[A-Z]{2,7}$/.test(last)) {
      return last;
    }
  }
  return name.replace(/\s*\([^)]*\)\s*/g, '').trim();
}

export function kindLabel(authority: AuthorityFile): string {
  return authority.identity.type.value === 'mainland' ? en.kind.mainland : en.kind['free-zone'];
}

// The line under a title: what kind of requirement this is, in the catalogue's own terms.
function describe(
  requirement: Requirement | null,
  person: Person | null,
  authority: AuthorityFile,
  office: Office | null,
): string {
  if (requirement === null) {
    return '';
  }
  // An instalment is a lease payment, not a first-days item: it names the premises it is for.
  if (requirement.key === 'rent-instalment') {
    const address = office?.premises.address ?? '';
    return address === '' ? requirement.title : `${requirement.title} · ${address}`;
  }
  if (requirement.key === 'licence-renewal') {
    return `Renewed with ${authority.identity.name.value ?? 'the authority'}`;
  }
  if (person !== null) {
    return person.identity.role === '' ? 'For one person' : person.identity.role;
  }
  switch (requirement.group) {
    case 'day0':
      return 'After the licence is issued';
    case 'yearly':
      return 'Every year';
    case 'periodic':
      return requirement.recurrence === 'monthly'
        ? 'Every month'
        : requirement.recurrence === 'quarterly'
          ? 'Every quarter'
          : 'Every period';
    case 'people':
      return 'For one person';
    case 'change':
      return 'After a change you declared';
    case 'exit':
      return 'When the company closes';
  }
}

// The dated cards of one company as entries, soonest first. Undated cards (pending, unknown)
// have no place on a calendar and stay on the compliance board.
export function entriesOf(bundle: Bundle, today: IsoDate): Entry[] {
  const { facts, authority } = bundle;
  const people = new Map(bundle.people.map((person) => [person.id, person]));
  const offices = new Map(bundle.offices.map((office) => [office.id, office]));
  const list: Entry[] = [];
  for (const card of bundle.cards) {
    if (card.dueOn === null) {
      continue;
    }
    const requirement = findRequirement(card.requirementId) ?? null;
    const person = card.subjectId == null ? null : (people.get(card.subjectId) ?? null);
    const base = requirement?.title ?? card.requirementId;
    list.push({
      id: card.id,
      card,
      requirement,
      company: facts,
      companyName: facts.identity.tradeName,
      monogram: monogramOf(facts.identity.tradeName),
      person,
      title: person === null ? base : `${person.identity.name} · ${base}`,
      subtitle: describe(
        requirement,
        person,
        authority,
        card.subjectId == null ? null : (offices.get(card.subjectId) ?? null),
      ),
      family: familyOf(card.area, card.requirementId),
      date: card.dueOn,
      days: daysUntil(card.dueOn, today),
      state: card.state,
      status: card.state === 'complete' ? 'done' : 'upcoming',
    });
  }
  return withoutGenericStages(list).sort(compareEntries);
}

// The visa stages card is the generic line of a person's chain. When the same person has a more
// specific card on the same date in the same status (the labour contract, the residency), the
// generic line repeats it: one row per person per date, the more specific title kept.
function withoutGenericStages(list: readonly Entry[]): Entry[] {
  const specific = new Set(
    list
      .filter((entry) => entry.person !== null && entry.requirement?.key !== 'visa-stages')
      .map((entry) => `${entry.person?.id ?? ''}|${entry.date}|${entry.status}`),
  );
  return list.filter(
    (entry) =>
      entry.person === null ||
      entry.requirement?.key !== 'visa-stages' ||
      !specific.has(`${entry.person.id}|${entry.date}|${entry.status}`),
  );
}

function compareEntries(a: Entry, b: Entry): number {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function upcomingOf(entries: readonly Entry[]): Entry[] {
  return entries.filter((entry) => entry.status === 'upcoming');
}

// What is behind you, most recent first.
export function settledOf(entries: readonly Entry[]): Entry[] {
  return entries.filter((entry) => entry.status === 'done').sort((a, b) => -compareEntries(a, b));
}

// Lite's row words for the days: "3 days", "2 days late".
export function daysLabel(days: number): string {
  return days < 0
    ? plural(-days, en.units.daysLate.one, en.units.daysLate.other)
    : plural(days, en.units.days.one, en.units.days.other);
}

// How this date is worked out, in the catalogue's terms: the trigger, the constant, the lead.
// Nothing here is a rule of its own; every number is the one packages/rules used.
export function howWorkedOut(entry: Entry): string[] {
  const requirement = entry.requirement;
  if (requirement === null) {
    return [];
  }
  const lines: string[] = [];
  switch (requirement.key) {
    case 'corporate-tax-return':
      lines.push(
        `${String(federalRules.corporateTax.returnMonths.value)} months after the financial year end (${entry.company.identity.financialYearEnd}).`,
      );
      break;
    case 'general-assembly':
      lines.push(`${String(GENERAL_ASSEMBLY_MONTHS)} months after the financial year end.`);
      break;
    case 'corporate-tax-registration':
      lines.push(
        `${String(federalRules.corporateTax.registrationMonths.value)} months after incorporation (${formatLong(entry.company.identity.incorporationDate)}).`,
      );
      break;
    case 'ubo-declaration':
      lines.push(`${String(federalRules.ubo.declarationDays.value)} days after incorporation.`);
      break;
    case 'ownership-change':
      lines.push(
        `${String(federalRules.ubo.updateDays.value)} days after the change you declared.`,
      );
      break;
    case 'vat-return':
      lines.push(
        `${String(federalRules.vat.returnDays.value)} days after the end of each VAT period.`,
      );
      break;
    case 'absence-abroad':
      lines.push(`${String(ABSENCE_ABROAD_DAYS)} days after the last exit recorded.`);
      break;
    default:
      lines.push(triggerLine(requirement));
  }
  lines.push(
    `Reminders start ${String(requirement.defaultLeadDays)} days before, then closer to the day.`,
  );
  return lines;
}

function triggerLine(requirement: Requirement): string {
  switch (requirement.triggerKind) {
    case 'licenceExpiry':
      return 'The expiry date printed on the licence.';
    case 'cardExpiry':
      return 'The expiry date printed on the card.';
    case 'leaseEnd':
      return 'The end date of the lease.';
    case 'rentInstalment':
      return 'An instalment date in the lease.';
    case 'yearEnd':
      return 'From the financial year end.';
    case 'taxPeriodEnd':
      return 'From the end of the tax period.';
    case 'visaExpiry':
      return 'The expiry date of the residence visa.';
    case 'emiratesIdExpiry':
      return 'The expiry date of the Emirates ID.';
    case 'passportExpiry':
      return 'The expiry date of the passport.';
    case 'workPermitExpiry':
      return 'The expiry date of the work permit.';
    case 'insuranceEnd':
      return 'The end date of the health insurance policy.';
    case 'entryDate':
      return 'From the date of entry.';
    case 'probationEnd':
      return 'The end of the probation period on the contract.';
    case 'lastExit':
      return 'From the last exit recorded.';
    case 'payDay':
      return 'The pay day, each month.';
    case 'ownershipChange':
      return 'From the ownership change you declared.';
    case 'activityChange':
      return 'From the activity change on the licence.';
    case 'onboarding':
      return 'From the day the licence was issued.';
    case 'decision':
      return 'Set when the question was opened.';
    case 'event':
      return 'Set when the change was declared.';
    case 'kycDate':
      return 'The refresh date the bank set.';
  }
}
