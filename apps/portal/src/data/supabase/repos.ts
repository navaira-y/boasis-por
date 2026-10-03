import {
  AuditEvent,
  Card,
  CompanyFacts,
  Document,
  DocumentVersion,
  HistoryEntry,
  Office,
  Person,
} from '@boasis/schema';
import type {
  Actor,
  AuditKind,
  HistoryKind,
  HistorySubject,
} from '@boasis/schema';
import type { ZodType, ZodTypeDef } from 'zod';
import { nowStamp, today } from '../../lib/today';
import type {
  AccessRepo,
  AccountPeopleRepo,
  AccountsRepo,
  AuditRepo,
  AuthAdapter,
  BreachedPasswordCheck,
  CardsRepo,
  CompaniesRepo,
  DocumentsRepo,
  FieldChangeKind,
  FieldChangeOptions,
  HistoryFilter,
  HistoryRepo,
  NewRecord,
  OfficesRepo,
  OnboardingRepo,
  Patch,
  PeopleRepo,
  Repos,
  RolesRepo,
} from '../types';
import { currentActor, requireUser } from './actor';
import { supabase } from './client';
import {
  changedLine,
  fieldChanges,
  fieldList,
  KIND_VERB,
  type FieldChange,
} from './diff';

// The Supabase data layer: the same Repos interfaces the screens already use, backed by the
// migration-0004 tables instead of the mock store. Behaviour mirrors the mock (the reference):
// every write is validated, a create writes a 'created' history entry, updateFields writes one
// history entry per changed field, and every write appends one audit line.
//
// Reads tolerate rows that do not match the schema (companies created before the facts
// document existed): they are skipped with a warning, never a crash. Writes are strict.

function newId(): string {
  return crypto.randomUUID();
}

function noRecord(label: string, id: string): never {
  throw new Error(`${label}: no record with id ${id}`);
}

interface PostgrestError {
  readonly message: string;
  readonly code: string;
}

function rethrow(error: PostgrestError | null | undefined): void {
  if (error !== null && error !== undefined) {
    throw new Error(error.message);
  }
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function parseOrWarn<T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  label: string,
  id: string,
  raw: unknown,
): T | null {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    console.warn(`${label}: skipping row ${id}; it does not match the schema.`);
    return null;
  }
  return parsed.data;
}

// ------------------------------------------------------------------ documents --

interface DocRow {
  readonly id: string;
  readonly company_id: string;
  readonly data: unknown;
}

type DocTable = 'company_offices' | 'company_people' | 'company_documents' | 'company_cards';

async function readDoc<T>(
  table: DocTable,
  label: string,
  id: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<T | null> {
  const { data, error } = await supabase()
    .from(table)
    .select('id, data')
    .eq('id', id)
    .maybeSingle();
  rethrow(error as PostgrestError | null);
  if (data === null || data === undefined) {
    return null;
  }
  const row = data as DocRow;
  return parseOrWarn(schema, label, row.id, { ...asObject(row.data), id: row.id });
}

async function listDocs<T>(
  table: DocTable,
  label: string,
  companyId: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
): Promise<T[]> {
  const { data, error } = await supabase()
    .from(table)
    .select('id, data')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  rethrow(error as PostgrestError | null);
  const rows = (data ?? []) as DocRow[];
  const records: T[] = [];
  for (const row of rows) {
    const record = parseOrWarn(schema, label, row.id, {
      ...asObject(row.data),
      id: row.id,
    });
    if (record !== null) {
      records.push(record);
    }
  }
  return records;
}

// ---------------------------------------------------------- history + audit --

// Spec 5.1: one history entry per changed field.
async function insertHistory(
  companyId: string,
  subject: HistorySubject,
  changes: readonly FieldChange[],
  kind: HistoryKind,
  who: Actor,
  documentId: string | null,
): Promise<void> {
  if (changes.length === 0) {
    return;
  }
  const on = today();
  const rows = changes.map((change) => {
    const entry = HistoryEntry.parse({
      id: newId(),
      companyId,
      subject,
      fieldPath: change.path,
      oldValue: change.oldValue,
      newValue: change.newValue,
      kind,
      on,
      who,
      documentId,
    });
    return {
      id: entry.id,
      company_id: entry.companyId,
      subject_kind: entry.subject.kind,
      subject_id: entry.subject.id,
      field_path: entry.fieldPath,
      old_value: entry.oldValue,
      new_value: entry.newValue,
      kind: entry.kind,
      on_date: entry.on,
      who: entry.who,
      document_id: entry.documentId ?? null,
    };
  });
  const { error } = await supabase().from('company_history').insert(rows);
  rethrow(error as PostgrestError | null);
}

// Spec 7.3: one audit line per write.
async function insertAudit(event: {
  readonly companyId: string;
  readonly kind: AuditKind;
  readonly summary: string;
  readonly cardId?: string | null;
  readonly documentId?: string | null;
  readonly personId?: string | null;
  readonly who?: Actor;
}): Promise<void> {
  const line = AuditEvent.parse({
    id: newId(),
    companyId: event.companyId,
    when: nowStamp(),
    who: event.who ?? (await currentActor()),
    kind: event.kind,
    summary: event.summary,
    cardId: event.cardId ?? null,
    documentId: event.documentId ?? null,
    personId: event.personId ?? null,
  });
  const { error } = await supabase().from('company_audit').insert({
    id: line.id,
    company_id: line.companyId,
    kind: line.kind,
    summary: line.summary,
    when_at: line.when,
    who: line.who,
    card_id: line.cardId ?? null,
    person_id: line.personId ?? null,
    document_id: line.documentId ?? null,
  });
  rethrow(error as PostgrestError | null);
}

async function createdEntry(
  companyId: string,
  subject: HistorySubject,
  who: Actor,
): Promise<void> {
  await insertHistory(
    companyId,
    subject,
    [{ path: 'record', oldValue: null, newValue: null }],
    'created',
    who,
    null,
  );
}

// --------------------------------------------------------------- companies --

interface CompanyRow {
  readonly id: string;
  readonly facts: unknown;
}

async function readCompany(id: string): Promise<CompanyFacts | null> {
  const { data, error } = await supabase()
    .from('companies')
    .select('id, facts')
    .eq('id', id)
    .maybeSingle();
  rethrow(error as PostgrestError | null);
  if (data === null || data === undefined) {
    return null;
  }
  const row = data as CompanyRow;
  return parseOrWarn(CompanyFacts, 'companies', row.id, {
    ...asObject(row.facts),
    id: row.id,
  });
}

// The extracted columns are derived from the merged record on every write, never from the
// patch, so they cannot drift from the facts document.
function extractedOf(record: CompanyFacts) {
  return {
    authority_id: record.identity.authority,
    name: record.identity.tradeName,
    licence_number: record.identity.licenceNumber,
    trade_name: record.identity.tradeName,
    licence_expiry: record.identity.expiryDate,
  };
}

const companies: CompaniesRepo = {
  get: (id) => readCompany(id),
  list: async () => {
    const { data, error } = await supabase()
      .from('companies')
      .select('id, facts')
      .order('created_at', { ascending: true });
    rethrow(error as PostgrestError | null);
    const rows = (data ?? []) as CompanyRow[];
    const records: CompanyFacts[] = [];
    for (const row of rows) {
      const record = parseOrWarn(CompanyFacts, 'companies', row.id, {
        ...asObject(row.facts),
        id: row.id,
      });
      if (record !== null) {
        records.push(record);
      }
    }
    return records;
  },
  create: async (input) => {
    const user = await requireUser();
    const record = CompanyFacts.parse({ ...input, id: newId() });
    const { error } = await supabase().from('companies').insert({
      id: record.id,
      owner_profile_id: user.id,
      ...extractedOf(record),
      facts: record,
    });
    if (error !== null && error !== undefined) {
      const pg = error as PostgrestError;
      if (pg.code === '23505') {
        throw new Error(
          'A company with this licence number is already on Boasis under this zone.',
        );
      }
      throw new Error(pg.message);
    }
    const who = await currentActor();
    await createdEntry(record.id, { kind: 'company', id: record.id }, who);
    await insertAudit({
      companyId: record.id,
      kind: 'field-changed',
      summary: `Added ${record.identity.tradeName}`,
      who,
    });
    return record;
  },
  update: async (id, patch) => {
    const before = (await readCompany(id)) ?? noRecord('companies', id);
    const after = CompanyFacts.parse({ ...before, ...patch, id });
    const { error } = await supabase()
      .from('companies')
      .update({ ...extractedOf(after), facts: after })
      .eq('id', id);
    rethrow(error as PostgrestError | null);
    const changes = fieldChanges(before, after);
    if (changes.length > 0) {
      await insertAudit({
        companyId: after.id,
        kind: 'field-changed',
        summary: changedLine(changes, after.identity.tradeName),
      });
    }
    return after;
  },
  updateFields: async (id, patch, kind, options = {}) => {
    const who = options.actor ?? (await currentActor());
    const documentId = options.documentId ?? null;
    const before = (await readCompany(id)) ?? noRecord('companies', id);
    const after = CompanyFacts.parse({ ...before, ...patch, id });
    const { error } = await supabase()
      .from('companies')
      .update({ ...extractedOf(after), facts: after })
      .eq('id', id);
    rethrow(error as PostgrestError | null);
    const changes = fieldChanges(before, after);
    if (changes.length > 0) {
      await insertHistory(
        after.id,
        { kind: 'company', id },
        changes,
        kind,
        who,
        documentId,
      );
      await insertAudit({
        companyId: after.id,
        kind: 'field-changed',
        summary: `${KIND_VERB[kind]} ${fieldList(changes)} for ${after.identity.tradeName}`,
        documentId,
        who,
      });
    }
    return after;
  },
  // Removing a company takes its offices, people, documents, cards, history and trail with
  // it: the foreign keys cascade, like the mock's removeCompany. No audit line survives, for
  // the same reason.
  remove: async (id) => {
    const { error } = await supabase().from('companies').delete().eq('id', id);
    rethrow(error as PostgrestError | null);
  },
  // Onboarding v2 step 1: the definer RPC answers yes or no only; who holds the licence is
  // never revealed, and RLS would hide other owners' rows from a plain select.
  licenceTaken: async (authority, licenceNumber) => {
    const { data, error } = await supabase().rpc('licence_taken', {
      p_authority: authority,
      p_licence: licenceNumber,
    });
    rethrow(error as PostgrestError | null);
    return data === true;
  },
};

// -------------------------------------------------------- offices + people --

interface FieldCollection<T extends { id: string; companyId: string }> {
  readonly table: DocTable;
  readonly label: string;
  readonly schema: ZodType<T, ZodTypeDef, unknown>;
  readonly subjectKind: HistorySubject['kind'];
  readonly nameOf: (record: T) => string;
  readonly personOf: (record: T) => string | null;
}

function fieldCollection<T extends { id: string; companyId: string }>(
  def: FieldCollection<T>,
) {
  const readStrict = async (id: string): Promise<T> => {
    const record = await readDoc(def.table, def.label, id, def.schema);
    if (record === null) {
      noRecord(def.label, id);
    }
    return record;
  };
  return {
    get: (id: string): Promise<T | null> => readDoc(def.table, def.label, id, def.schema),
    list: (companyId: string): Promise<T[]> =>
      listDocs(def.table, def.label, companyId, def.schema),
    create: async (input: NewRecord<T>): Promise<T> => {
      await requireUser();
      const record = def.schema.parse({ ...input, id: newId() });
      const { error } = await supabase().from(def.table).insert({
        id: record.id,
        company_id: record.companyId,
        data: record,
      });
      rethrow(error as PostgrestError | null);
      const who = await currentActor();
      await createdEntry(record.companyId, { kind: def.subjectKind, id: record.id }, who);
      await insertAudit({
        companyId: record.companyId,
        kind: 'field-changed',
        summary: `Added ${def.nameOf(record)}`,
        personId: def.personOf(record),
        who,
      });
      return record;
    },
    update: async (id: string, patch: Patch<T>): Promise<T> => {
      const before = await readStrict(id);
      const after = def.schema.parse({ ...before, ...patch, id });
      const { error } = await supabase()
        .from(def.table)
        .update({ data: after })
        .eq('id', id);
      rethrow(error as PostgrestError | null);
      const changes = fieldChanges(before, after);
      if (changes.length > 0) {
        await insertAudit({
          companyId: after.companyId,
          kind: 'field-changed',
          summary: changedLine(changes, def.nameOf(after)),
          personId: def.personOf(after),
        });
      }
      return after;
    },
    updateFields: async (
      id: string,
      patch: Patch<T>,
      kind: FieldChangeKind,
      options: FieldChangeOptions = {},
    ): Promise<T> => {
      const who = options.actor ?? (await currentActor());
      const documentId = options.documentId ?? null;
      const before = await readStrict(id);
      const after = def.schema.parse({ ...before, ...patch, id });
      const { error } = await supabase()
        .from(def.table)
        .update({ data: after })
        .eq('id', id);
      rethrow(error as PostgrestError | null);
      const changes = fieldChanges(before, after);
      if (changes.length > 0) {
        const companyId = after.companyId;
        await insertHistory(
          companyId,
          { kind: def.subjectKind, id },
          changes,
          kind,
          who,
          documentId,
        );
        await insertAudit({
          companyId,
          kind: 'field-changed',
          summary: `${KIND_VERB[kind]} ${fieldList(changes)} for ${def.nameOf(after)}`,
          personId: def.personOf(after),
          documentId,
          who,
        });
      }
      return after;
    },
  };
}

// --------------------------------------------------------------- documents --

const documents: DocumentsRepo = {
  get: (id) => readDoc('company_documents', 'documents', id, Document),
  list: (companyId) => listDocs('company_documents', 'documents', companyId, Document),
  create: async (input) => {
    await requireUser();
    const record = Document.parse({ ...input, id: newId() });
    const { error } = await supabase().from('company_documents').insert({
      id: record.id,
      company_id: record.companyId,
      data: record,
    });
    rethrow(error as PostgrestError | null);
    await insertAudit({
      companyId: record.companyId,
      kind: 'document-added',
      summary: `Added ${record.title}`,
      documentId: record.id,
      personId: record.personId,
    });
    return record;
  },
  update: async (id, patch) => {
    const before =
      (await readDoc('company_documents', 'documents', id, Document)) ??
      noRecord('documents', id);
    const after = Document.parse({ ...before, ...patch, id });
    const { error } = await supabase()
      .from('company_documents')
      .update({ data: after })
      .eq('id', id);
    rethrow(error as PostgrestError | null);
    const changes = fieldChanges(before, after);
    if (changes.length > 0) {
      await insertAudit({
        companyId: after.companyId,
        kind: 'field-changed',
        summary: changedLine(changes, after.title),
        documentId: id,
        personId: after.personId,
      });
    }
    return after;
  },
  // Spec 5.3: the new file becomes the current version and the old one is kept.
  replace: async (id, next) => {
    const before =
      (await readDoc('company_documents', 'documents', id, Document)) ??
      noRecord('documents', id);
    const kept = DocumentVersion.parse({
      version: before.version,
      title: before.title,
      fileName: before.fileName,
      issueDate: before.issueDate,
      expiryDate: before.expiryDate,
      uploadedOn: before.uploadedOn,
      replacedOn: next.uploadedOn,
    });
    const after = Document.parse({
      ...before,
      title: next.title ?? before.title,
      fileName: next.fileName,
      issueDate: next.issueDate,
      expiryDate: next.expiryDate,
      uploadedOn: next.uploadedOn,
      version: before.version + 1,
      extracted: next.extracted === undefined ? before.extracted : next.extracted,
      previousVersions: [kept, ...(before.previousVersions ?? [])],
      id,
    });
    const { error } = await supabase()
      .from('company_documents')
      .update({ data: after })
      .eq('id', id);
    rethrow(error as PostgrestError | null);
    await insertAudit({
      companyId: after.companyId,
      kind: 'document-replaced',
      summary: `Replaced ${after.title}, version ${String(before.version)} kept`,
      documentId: id,
      personId: after.personId,
    });
    return after;
  },
  versions: async (id) =>
    (await readDoc('company_documents', 'documents', id, Document))?.previousVersions ?? [],
  // Spec 5.3: deleting needs an owner. Rejects for any other actor.
  remove: async (id, actor) => {
    if (actor.kind !== 'owner') {
      throw new Error('Only an owner can delete a document.');
    }
    const existing =
      (await readDoc('company_documents', 'documents', id, Document)) ??
      noRecord('documents', id);
    // An office whose tenancy contract this was no longer points at it.
    const companyOffices = await listDocs('company_offices', 'offices', existing.companyId, Office);
    for (const office of companyOffices) {
      if (office.lease.tenancyContractDocumentId === id) {
        const cleared = Office.parse({
          ...office,
          lease: { ...office.lease, tenancyContractDocumentId: null },
        });
        const { error } = await supabase()
          .from('company_offices')
          .update({ data: cleared })
          .eq('id', cleared.id);
        rethrow(error as PostgrestError | null);
      }
    }
    const { error } = await supabase().from('company_documents').delete().eq('id', id);
    rethrow(error as PostgrestError | null);
    await insertAudit({
      companyId: existing.companyId,
      kind: 'document-deleted',
      summary: `Deleted ${existing.title}`,
      documentId: id,
      personId: existing.personId,
      who: actor,
    });
  },
};

// ------------------------------------------------------------------- cards --

function requirementLabel(card: Card): string {
  return card.requirementId.replace(/-/g, ' ');
}

// Spec 7.3: a tick, a reference or another change on a card, as one line.
async function cardLine(before: Card | null, after: Card): Promise<void> {
  const label = requirementLabel(after);
  const subject = after.subjectId ?? null;
  const personId =
    subject !== null &&
    (await readDoc('company_people', 'people', subject, Person)) !== null
      ? subject
      : null;
  const hadReference = (reference: string, date: string): boolean =>
    (before?.evidence ?? []).some(
      (evidence) =>
        evidence.kind === 'reference' &&
        evidence.reference === reference &&
        evidence.date === date,
    );
  const reference = after.evidence.find(
    (evidence) =>
      evidence.kind === 'reference' && !hadReference(evidence.reference, evidence.date),
  );
  const document = after.evidence.find(
    (evidence) =>
      evidence.kind === 'document' &&
      !(before?.evidence ?? []).some(
        (old) => old.kind === 'document' && old.documentId === evidence.documentId,
      ),
  );
  const documentId = document?.kind === 'document' ? document.documentId : null;
  const wasDone = (stepId: string): boolean =>
    (before?.steps ?? []).some((step) => step.id === stepId && step.done);
  const ticked = after.steps.filter((step) => step.done && !wasDone(step.id));
  const base = { companyId: after.companyId, cardId: after.id, personId, documentId };
  if (reference?.kind === 'reference') {
    await insertAudit({
      ...base,
      kind: 'reference-logged',
      summary: `Logged reference ${reference.reference} on ${label}`,
    });
  } else if (ticked.length > 0) {
    const first = ticked[0]?.title ?? '';
    const more = ticked.length > 1 ? ` and ${String(ticked.length - 1)} more` : '';
    await insertAudit({ ...base, kind: 'step-ticked', summary: `Ticked "${first}"${more} on ${label}` });
  } else {
    await insertAudit({ ...base, kind: 'field-changed', summary: `Updated ${label}` });
  }
}

const cards: CardsRepo = {
  get: (id) => readDoc('company_cards', 'cards', id, Card),
  list: (companyId) => listDocs('company_cards', 'cards', companyId, Card),
  create: async (input) => {
    await requireUser();
    const record = Card.parse({ ...input, id: newId() });
    const { error } = await supabase().from('company_cards').insert({
      id: record.id,
      company_id: record.companyId,
      data: record,
    });
    rethrow(error as PostgrestError | null);
    await cardLine(null, record);
    return record;
  },
  update: async (id, patch) => {
    const before =
      (await readDoc('company_cards', 'cards', id, Card)) ?? noRecord('cards', id);
    const after = Card.parse({ ...before, ...patch, id });
    const { error } = await supabase()
      .from('company_cards')
      .update({ data: after })
      .eq('id', id);
    rethrow(error as PostgrestError | null);
    await cardLine(before, after);
    return after;
  },
  // Writes a card under the id packages/rules gave it (a computed card has no stored row
  // until someone ticks it), replacing any row with that id.
  put: async (card) => {
    await requireUser();
    const before = await readDoc('company_cards', 'cards', card.id, Card);
    const after = Card.parse(card);
    const { error } = await supabase().from('company_cards').upsert({
      id: after.id,
      company_id: after.companyId,
      data: after,
    });
    rethrow(error as PostgrestError | null);
    await cardLine(before, after);
    return after;
  },
};

// ----------------------------------------------------------------- history --

interface HistoryRow {
  readonly id: string;
  readonly company_id: string;
  readonly subject_kind: string;
  readonly subject_id: string;
  readonly field_path: string;
  readonly old_value: unknown;
  readonly new_value: unknown;
  readonly kind: string;
  readonly on_date: string;
  readonly who: unknown;
  readonly document_id: string | null;
}

function matchesFilter(entry: HistoryEntry, filter: HistoryFilter): boolean {
  const subject = filter.subject;
  if (
    subject !== undefined &&
    (entry.subject.kind !== subject.kind || entry.subject.id !== subject.id)
  ) {
    return false;
  }
  const path = filter.fieldPath;
  return path === undefined || entry.fieldPath === path || entry.fieldPath.startsWith(`${path}.`);
}

const history: HistoryRepo = {
  // A company's field history, newest first, optionally narrowed to one record or one field.
  list: async (companyId, filter = {}) => {
    const { data, error } = await supabase()
      .from('company_history')
      .select('*')
      .eq('company_id', companyId)
      .order('on_date', { ascending: false })
      .order('created_at', { ascending: false });
    rethrow(error as PostgrestError | null);
    const entries: HistoryEntry[] = [];
    for (const row of (data ?? []) as HistoryRow[]) {
      const entry = parseOrWarn(HistoryEntry, 'history', row.id, {
        id: row.id,
        companyId: row.company_id,
        subject: { kind: row.subject_kind, id: row.subject_id },
        fieldPath: row.field_path,
        oldValue: row.old_value ?? null,
        newValue: row.new_value ?? null,
        kind: row.kind,
        on: row.on_date,
        who: row.who,
        documentId: row.document_id,
      });
      if (entry !== null && matchesFilter(entry, filter)) {
        entries.push(entry);
      }
    }
    return entries;
  },
};

// ------------------------------------------------------------------- audit --

interface AuditRow {
  readonly id: string;
  readonly company_id: string;
  readonly kind: string;
  readonly summary: string;
  readonly when_at: string;
  readonly who: unknown;
  readonly card_id: string | null;
  readonly person_id: string | null;
  readonly document_id: string | null;
}

const audit: AuditRepo = {
  // A company's audit trail, newest first (spec 7.3).
  list: async (companyId) => {
    const { data, error } = await supabase()
      .from('company_audit')
      .select('*')
      .eq('company_id', companyId)
      .order('when_at', { ascending: false })
      .order('created_at', { ascending: false });
    rethrow(error as PostgrestError | null);
    const events: AuditEvent[] = [];
    for (const row of (data ?? []) as AuditRow[]) {
      let when: string;
      try {
        when = new Date(row.when_at).toISOString();
      } catch {
        console.warn(`audit: skipping row ${row.id}; when_at is not a date.`);
        continue;
      }
      const event = parseOrWarn(AuditEvent, 'audit', row.id, {
        id: row.id,
        companyId: row.company_id,
        when,
        who: row.who,
        kind: row.kind,
        summary: row.summary,
        cardId: row.card_id,
        documentId: row.document_id,
        personId: row.person_id,
      });
      if (event !== null) {
        events.push(event);
      }
    }
    return events;
  },
};

// ---------------------------------------------------- not in slice 1 (yet) --

// Accounts, auth, passwords, member grants, roles, onboarding and access need their own
// tables (migration 0005) and, for auth, the serving slice. They fail loudly instead of
// pretending, so a screen wired too early is found in testing, not in production.
function stub<R extends object>(repo: string): R {
  return new Proxy({} as R, {
    get: () => (): Promise<never> =>
      Promise.reject(new Error(`${repo} is not in the Supabase data layer yet.`)),
  });
}

export function createSupabaseRepos(): Repos {
  const offices: OfficesRepo = fieldCollection({
    table: 'company_offices',
    label: 'offices',
    schema: Office,
    subjectKind: 'office',
    nameOf: (record: Office) => `the office at ${record.premises.address}`,
    personOf: () => null,
  });
  const people: PeopleRepo = fieldCollection({
    table: 'company_people',
    label: 'people',
    schema: Person,
    subjectKind: 'person',
    nameOf: (record: Person) => record.identity.name,
    personOf: (record: Person) => record.id,
  });
  return {
    accounts: stub<AccountsRepo>('accounts'),
    auth: stub<AuthAdapter>('auth'),
    passwords: stub<BreachedPasswordCheck>('passwords'),
    accountPeople: stub<AccountPeopleRepo>('accountPeople'),
    roles: stub<RolesRepo>('roles'),
    onboarding: stub<OnboardingRepo>('onboarding'),
    companies,
    offices,
    people,
    documents,
    access: stub<AccessRepo>('access'),
    cards,
    history,
    audit,
  };
}
