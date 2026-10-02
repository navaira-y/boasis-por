import { isBefore, stateFor } from '@boasis/rules';
import { DocumentType, type Document, type IsoDate, type Person } from '@boasis/schema';
import type { LibraryEntry } from '../content/content';

// How a document type reads on screen, from the schema id: "authority-agreement" becomes
// "Authority agreement". The few initialisms keep their capitals.
const CAPITALS: Readonly<Record<string, string>> = {
  ubo: 'UBO',
  vat: 'VAT',
  pro: 'PRO',
  'e-signature': 'E-signature',
  emirates: 'Emirates',
  id: 'ID',
  ejari: 'Ejari',
};

export function documentTypeLabel(type: DocumentType): string {
  const words = type.split('-').map((word) => CAPITALS[word] ?? word);
  const joined = words
    .join(' ')
    .replace('E signature', 'E-signature')
    .replace('e signature', 'E-signature');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

export const DOCUMENT_TYPES: readonly DocumentType[] = DocumentType.options;

// Lite flags a file as due soon within sixty days of its date; read through spec 7.1's table
// with a sixty-day lead.
export const DOCUMENT_LEAD_DAYS = 60;

// The flag on a vault row: expired once the date has passed, due soon only inside the lead
// window, nothing otherwise (and nothing for a paper without a date).
export function documentFlag(
  expiryDate: IsoDate | null,
  today: IsoDate,
): 'expired' | 'due-soon' | null {
  if (expiryDate === null) {
    return null;
  }
  const state = stateFor({ dueOn: expiryDate, today, leadDays: DOCUMENT_LEAD_DAYS });
  if (state === 'overdue') {
    return 'expired';
  }
  return state === 'expiring' || state === 'action-soon' ? 'due-soon' : null;
}

// Spec 5.3: the papers stored against a person rather than the company.
export const PERSON_DOCUMENT_TYPES: readonly DocumentType[] = [
  'passport',
  'entry-permit',
  'visa',
  'emirates-id',
  'work-permit',
  'labour-contract',
  'offer-letter',
  'medical-result',
  'unemployment-insurance-certificate',
  'insurance-certificate',
];

export function isPersonType(type: DocumentType): boolean {
  return PERSON_DOCUMENT_TYPES.includes(type);
}

// Lite: only the papers whose date the person record holds prefill from it, and write back to
// it when filed (src/sheets/UploadSheet.jsx, COLUMN_OF).
export function personDateFor(person: Person, type: DocumentType): IsoDate | null {
  switch (type) {
    case 'passport':
      return person.identity.passportExpiry;
    case 'visa':
      return person.status.visaExpiry;
    case 'emirates-id':
      return person.status.emiratesIdExpiry;
    default:
      return null;
  }
}

export function withPersonDate(person: Person, type: DocumentType, date: IsoDate): Person {
  switch (type) {
    case 'passport':
      return { ...person, identity: { ...person.identity, passportExpiry: date } };
    case 'visa':
      return { ...person, status: { ...person.status, visaExpiry: date } };
    case 'emirates-id':
      return { ...person, status: { ...person.status, emiratesIdExpiry: date } };
    default:
      return person;
  }
}

// Spec 5.3 packs: the bank KYC pack lists what is present and what is missing or expired.
// What a bank asks for comes from the library entry "Your bank", section "Documents needed",
// of the company's authority (content/library/<authority>/your-bank.md). Each line there is
// matched to the vault's document types by its words.
export interface PackLine {
  label: string;
  types: DocumentType[];
  state: 'present' | 'expired' | 'missing';
  document: Document | null;
}

const WORDS: readonly { word: string; types: DocumentType[] }[] = [
  { word: 'licence', types: ['licence', 'amended-licence'] },
  { word: 'memorandum', types: ['memorandum'] },
  { word: 'signatory', types: ['signatory-letter'] },
  { word: 'board resolution', types: ['board-resolution'] },
  { word: 'passport', types: ['passport'] },
  { word: 'emirates id', types: ['emirates-id'] },
  { word: 'lease', types: ['lease', 'ejari-certificate'] },
  { word: 'ejari', types: ['ejari-certificate'] },
  { word: 'bank letter', types: ['bank-letter'] },
  { word: 'ubo', types: ['ubo-declaration'] },
  { word: 'audited', types: ['audited-accounts'] },
  { word: 'tax certificate', types: ['tax-certificate'] },
  { word: 'establishment card', types: ['establishment-card'] },
];

function typesFor(line: string): DocumentType[] {
  const lower = line.toLowerCase();
  const types = WORDS.filter((entry) => lower.includes(entry.word)).flatMap((entry) => entry.types);
  return [...new Set(types)];
}

// The lines under "## Documents needed" in the bank entry, one per paper named there.
export function bankPackLines(entry: LibraryEntry | null): string[] {
  if (entry === null) {
    return [];
  }
  const section = /## Documents needed\n([\s\S]*?)(?:\n## |$)/.exec(entry.body);
  if (section === null) {
    return [];
  }
  return (section[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/^[-*]\s+/, '').trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .flatMap((line) => line.split(/\s+and\s+/i).map((part) => part.trim()))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
}

export function bankPack(
  entry: LibraryEntry | null,
  documents: readonly Document[],
  today: IsoDate,
): PackLine[] {
  return bankPackLines(entry).map((label) => {
    const types = typesFor(label);
    const matching = documents
      .filter((document) => types.includes(document.type) && document.personId === null)
      .sort((a, b) => b.uploadedOn.localeCompare(a.uploadedOn));
    const document = matching[0] ?? null;
    let state: PackLine['state'] = 'missing';
    if (document !== null) {
      state =
        document.expiryDate !== null && isBefore(document.expiryDate, today)
          ? 'expired'
          : 'present';
    }
    return { label, types, state, document };
  });
}
