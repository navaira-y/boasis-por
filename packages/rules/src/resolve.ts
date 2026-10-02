import {
  QuestionId,
  type AnswerValue,
  type AuthorityFile,
  type CompanyFacts,
  type Document,
  type Fact,
  type FactGrade,
} from '@boasis/schema';
import type { RequirementKey } from './requirements';

// Build plan 3A: the portal serves every UAE authority from day one, so the person's own
// documents are the source of the dates, terms and fees for their company. Every rule input
// that a document or an answer could carry comes through here, in this order:
//   1. a term the reader pulled from the company's documents and a human confirmed,
//   2. the authority file when its value is confirmed,
//   3. an answer the owner gave (which also beats a file value that is only reported or unclear),
//   4. unknown, which the card shows and asks for (spec 7.1, 18.1).
// A deep authority file is enrichment, never a condition: a company under an authority with an
// empty file still gets its cards, from its documents and its answers.

export type FactKey = QuestionId;

export type FactSource = 'document' | 'authority-file' | 'owner-answer' | 'unknown';

export interface Resolved<T> {
  value: T | null;
  source: FactSource;
  grade: FactGrade;
}

// What the resolver reads. Documents are optional so a caller that has none, such as the
// RequirementClassifier seam, still resolves through the file and the answers.
export interface ResolveContext {
  facts: CompanyFacts;
  authority: AuthorityFile;
  documents?: readonly Document[];
}

export interface FactTypes {
  auditRequiredForRenewal: boolean;
  cancellationWindowDays: number;
  cancellationFeeInsideAed: number;
  cancellationFeeOutsideAed: number;
  renewalBundle: string[];
  wpsApplies: boolean;
  ejariRequired: boolean;
  generalAssemblyRequired: boolean;
  leaseMinimumRemainingDays: number;
}

// The question the onboarding screen asks when the fact is unknown, and the card it unblocks.
export interface Question {
  id: FactKey;
  text: string;
  unblocks: RequirementKey;
}

interface Definition<T> {
  // Layer 1: the confirmed value from the company's documents, or null.
  document: (documents: readonly Document[]) => T | null;
  // Layer 2: the authority file's fact, or null when the file lacks it or holds it as unknown.
  file: (authority: AuthorityFile) => Fact<T> | null;
  // Layer 3: the owner's answer, accepted only when it is of the fact's own type.
  answer: (raw: AnswerValue) => T | null;
  question: string;
  unblocks: RequirementKey;
}

type ExtractedTerms = NonNullable<Document['extracted']>;

const AGREEMENT: readonly Document['type'][] = ['authority-agreement'];
const AGREEMENT_OR_LEASE: readonly Document['type'][] = ['authority-agreement', 'lease'];

// Newest upload first, then the higher version, so a replaced document's term wins.
function newestFirst(a: Document, b: Document): number {
  if (a.uploadedOn !== b.uploadedOn) {
    return a.uploadedOn < b.uploadedOn ? 1 : -1;
  }
  return b.version - a.version;
}

// Spec 5.1: an extracted term counts only once a human ticked it (confirmedOn set).
function confirmedValue(term: ExtractedTerms[keyof ExtractedTerms]): unknown {
  if (term === null || term === undefined) {
    return null;
  }
  return term.confirmedOn === null ? null : term.value;
}

function confirmedTerm(
  documents: readonly Document[],
  types: readonly Document['type'][],
  key: keyof ExtractedTerms,
): unknown {
  const candidates = documents.filter((document) => types.includes(document.type));
  for (const document of [...candidates].sort(newestFirst)) {
    const value = confirmedValue(document.extracted?.[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function asNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function asBoolean(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null;
}

function isStringList(raw: unknown): raw is string[] {
  return Array.isArray(raw) && (raw as unknown[]).every((entry) => typeof entry === 'string');
}

// A list from a document arrives as a list; an owner types one as "licence, flexi-desk".
function asStringList(raw: unknown): string[] | null {
  if (isStringList(raw)) {
    return raw.length === 0 ? null : raw;
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const items = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length === 0 ? null : items;
}

// A file fact with a value; a fact held as unknown (value null) is the same as no fact.
function known<T>(fact: Fact<T> | undefined): Fact<T> | null {
  if (fact === undefined) {
    return null;
  }
  return fact.value === null ? null : fact;
}

function totalAed(fact: Fact<{ amountAed: number }[]>): Fact<number> {
  const lines = fact.value ?? [];
  return { ...fact, value: lines.reduce((sum, line) => sum + line.amountAed, 0) };
}

const DEFINITIONS: { [K in FactKey]: Definition<FactTypes[K]> } = {
  auditRequiredForRenewal: {
    document: () => null,
    // Spec 11A: the licence prerequisites and the company requirements both name the audit.
    file: (authority) =>
      known(authority.companyRequirements.auditRequiredForRenewal) ??
      known(authority.licence.prerequisites?.auditRequired),
    answer: asBoolean,
    question: 'Does your authority ask for audited accounts before the licence renews?',
    unblocks: 'audited-accounts',
  },
  cancellationWindowDays: {
    document: (documents) =>
      asNumber(confirmedTerm(documents, AGREEMENT, 'cancellationWindowDays')),
    file: (authority) => known(authority.licence.cancellationWindowDays),
    answer: asNumber,
    question: 'How many days is the cancellation window in your licence agreement?',
    unblocks: 'licence-renewal',
  },
  cancellationFeeInsideAed: {
    document: (documents) =>
      asNumber(confirmedTerm(documents, AGREEMENT, 'cancellationFeeInsideAed')),
    // The file lists fee lines; the company reads one total, as its agreement states it.
    file: (authority) => {
      const lines = known(authority.licence.cancellationFeesInsideWindow);
      return lines === null ? null : totalAed(lines);
    },
    answer: asNumber,
    question: 'What does cancelling inside the window cost, in AED?',
    unblocks: 'licence-renewal',
  },
  cancellationFeeOutsideAed: {
    document: (documents) =>
      asNumber(confirmedTerm(documents, AGREEMENT, 'cancellationFeeOutsideAed')),
    file: (authority) => {
      const lines = known(authority.licence.cancellationFeesOutsideWindow);
      return lines === null ? null : totalAed(lines);
    },
    answer: asNumber,
    question: 'What does cancelling outside the window cost, in AED?',
    unblocks: 'licence-renewal',
  },
  renewalBundle: {
    document: (documents) =>
      asStringList(confirmedTerm(documents, AGREEMENT_OR_LEASE, 'renewalBundle')),
    // The authority file has no field for what renews together; the agreement or the owner says.
    file: () => null,
    answer: asStringList,
    question: 'What renews together with the licence, for example the flexi-desk or the card?',
    unblocks: 'licence-renewal',
  },
  wpsApplies: {
    document: () => null,
    // Spec 11.3: the file flag, and without it the mainland is in (confirmed). The identity fact
    // lends its source and grade to that reading.
    file: (authority) =>
      known(authority.people.wpsApplies) ??
      (authority.identity.type.value === 'mainland'
        ? { ...authority.identity.type, value: true }
        : null),
    answer: asBoolean,
    question: 'Do you pay wages through the Wage Protection System (WPS)?',
    unblocks: 'wps-registration',
  },
  ejariRequired: {
    document: () => null,
    file: (authority) => known(authority.premises.ejariRequired),
    answer: asBoolean,
    question: 'Does your office need an Ejari registration?',
    unblocks: 'office-lease-and-ejari',
  },
  generalAssemblyRequired: {
    document: () => null,
    // Spec 11A has the general assembly as rule text; a rule on file means the requirement exists.
    file: (authority) => {
      const rule = known(authority.companyRequirements.generalAssemblyRule);
      return rule === null ? null : { ...rule, value: true };
    },
    answer: asBoolean,
    question: 'Must the company hold a general assembly each year?',
    unblocks: 'general-assembly',
  },
  leaseMinimumRemainingDays: {
    document: () => null,
    file: (authority) => known(authority.licence.prerequisites?.leaseMinimumRemainingDays),
    answer: asNumber,
    question: 'How many days must be left on the lease when the licence renews?',
    unblocks: 'licence-renewal',
  },
};

// The latest answer the owner gave to this question; a later entry wins a tie on the day.
function latestAnswer(facts: CompanyFacts, key: FactKey): AnswerValue | undefined {
  let latest: { answer: AnswerValue; answeredOn: string } | undefined;
  for (const entry of facts.answers ?? []) {
    if (
      entry.questionId === key &&
      (latest === undefined || entry.answeredOn >= latest.answeredOn)
    ) {
      latest = entry;
    }
  }
  return latest?.answer;
}

export function resolveFact<K extends FactKey>(
  key: K,
  context: ResolveContext,
): Resolved<FactTypes[K]> {
  const definition: Definition<FactTypes[K]> = DEFINITIONS[key];
  const fromDocument = definition.document(context.documents ?? []);
  if (fromDocument !== null) {
    return { value: fromDocument, source: 'document', grade: 'confirmed' };
  }
  const fromFile = definition.file(context.authority);
  const raw = latestAnswer(context.facts, key);
  const fromAnswer = raw === undefined ? null : definition.answer(raw);
  // A confirmed file value is Boasis-verified and beats the owner's answer. A file value that is
  // only reported or unclear loses to what the owner knows about their own company.
  if (fromFile !== null && fromFile.value !== null) {
    if (fromFile.grade === 'confirmed' || fromAnswer === null) {
      return { value: fromFile.value, source: 'authority-file', grade: fromFile.grade };
    }
  }
  if (fromAnswer !== null) {
    return { value: fromAnswer, source: 'owner-answer', grade: 'reported' };
  }
  return { value: null, source: 'unknown', grade: 'unclear' };
}

// The questions still open for this company, in the closed list's order, so the onboarding
// screen can ask them (spec 5.6 "already done?", 18.1 "unknown asks for it").
export function questionsToAsk(context: ResolveContext): Question[] {
  return QuestionId.options
    .filter((id) => resolveFact(id, context).value === null)
    .map((id) => ({ id, text: DEFINITIONS[id].question, unblocks: DEFINITIONS[id].unblocks }));
}
