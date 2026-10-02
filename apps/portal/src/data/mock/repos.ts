import {
  AccessGrant,
  Card,
  CompanyFacts,
  Document,
  DocumentVersion,
  Office,
  Person,
  type Actor,
  type AuditEvent,
  type DocumentReplacement,
  type HistoryEntry,
  type HistorySubject,
  type IsoDate,
} from '@boasis/schema';
import type { ZodType, ZodTypeDef } from 'zod';
import { actorFor } from '../../lib/access';
import { nowStamp, today } from '../../lib/today';
import type {
  FieldChangeKind,
  FieldChangeOptions,
  HistoryFilter,
  NewRecord,
  Patch,
  Repos,
} from '../types';
import { fieldChanges, fieldList, type FieldChange } from './fieldChanges';
import { createOnboardingRepos } from './onboarding';
import { OWNER_NAME, onboardingSeed, seed } from './seed';
import { localStorageAdapter, MockStore, type MockData, type StorageAdapter } from './store';

type Collection = 'companies' | 'offices' | 'people' | 'documents' | 'access' | 'cards';
type RecordOf<C extends Collection> = MockData[C][number];

// Who the session is: the owner's name and the grant the demo is acting as, if any. The app
// reads it from the stored session; tests pass their own.
export interface SessionIdentity {
  readonly ownerName: string;
  readonly actingAs: string | null;
  // The signed-in email. When given, the company list and the access grants hold only the
  // companies of that email's account (onboarding v2: a new account sees only its own items). Tests
  // that leave it out see every record.
  readonly email?: string | null;
}

// The day and the moment a write is stamped with. Tests pass fixed ones.
export interface Clock {
  today(): IsoDate;
  now(): string;
}

const ownerSession = (): SessionIdentity => ({ ownerName: OWNER_NAME, actingAs: null });
const systemClock: Clock = { today, now: () => nowStamp() };

function newId(): string {
  return crypto.randomUUID();
}

// A write that fails validation rejects like a network write would, instead of throwing.
function settle<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

// A small generic repository over one collection of the store. Every write is validated
// against the schema so the mock never holds a shape a screen cannot trust. Each write returns
// the record before and after, so the caller can write the history and the audit trail.
function collectionRepo<C extends Collection>(
  store: MockStore,
  name: C,
  schema: ZodType<RecordOf<C>, ZodTypeDef, unknown>,
) {
  const all = (): RecordOf<C>[] => store.read()[name];
  const save = (records: RecordOf<C>[]): void => {
    store.write({ ...store.read(), [name]: records });
  };
  const find = (id: string): RecordOf<C> | null => all().find((record) => record.id === id) ?? null;
  return {
    all,
    find,
    get: (id: string): Promise<RecordOf<C> | null> => Promise.resolve(find(id)),
    create(input: NewRecord<RecordOf<C>>): RecordOf<C> {
      const record = schema.parse({ ...input, id: newId() });
      save([...all(), record]);
      return record;
    },
    update(id: string, patch: Patch<RecordOf<C>>): { before: RecordOf<C>; after: RecordOf<C> } {
      const existing = find(id);
      if (existing === null) {
        throw new Error(`${name}: no record with id ${id}`);
      }
      const record = schema.parse({ ...existing, ...patch, id });
      save(all().map((current) => (current.id === id ? record : current)));
      return { before: existing, after: record };
    },
    put(input: RecordOf<C>): { before: RecordOf<C> | null; after: RecordOf<C> } {
      const record = schema.parse(input);
      const before = find(record.id);
      const rest = all().filter((current) => current.id !== record.id);
      save([...rest, record]);
      return { before, after: record };
    },
  };
}

// The two writes the field history is built on.
interface WritableRepo<T extends { id: string }> {
  create(input: NewRecord<T>): T;
  update(id: string, patch: Patch<T>): { before: T; after: T };
}

const KIND_VERB: Readonly<Record<FieldChangeKind, string>> = {
  correction: 'Corrected',
  amendment: 'Amended',
  'from-document': 'Confirmed from a document',
};

function requirementLabel(card: Card): string {
  return card.requirementId.replace(/-/g, ' ');
}

export { localStorageAdapter };

export function createMockRepos(
  adapter: StorageAdapter = localStorageAdapter(),
  session: () => SessionIdentity = ownerSession,
  clock: Clock = systemClock,
): Repos {
  const store = new MockStore(adapter, seed, (companyIds) =>
    onboardingSeed(clock.today(), companyIds),
  );
  const onboardingRepos = createOnboardingRepos(store, () => clock.today());
  const companies = collectionRepo(store, 'companies', CompanyFacts);
  const offices = collectionRepo(store, 'offices', Office);
  const people = collectionRepo(store, 'people', Person);
  const documents = collectionRepo(store, 'documents', Document);
  const access = collectionRepo(store, 'access', AccessGrant);
  const cards = collectionRepo(store, 'cards', Card);
  const byCompany =
    <T extends { companyId: string }>(all: () => T[]) =>
    (companyId: string): Promise<T[]> =>
      Promise.resolve(all().filter((record) => record.companyId === companyId));

  const currentActor = (): Actor => {
    const identity = session();
    return actorFor(identity.ownerName, identity.actingAs, access.all());
  };

  // Spec 7.3: one audit line per write.
  const audit = (
    event: Omit<AuditEvent, 'id' | 'when' | 'who'> & { readonly who?: Actor | undefined },
  ): void => {
    const line: AuditEvent = {
      ...event,
      id: newId(),
      when: clock.now(),
      who: event.who ?? currentActor(),
    };
    const data = store.read();
    store.write({ ...data, audit: [...data.audit, line] });
  };

  // Spec 5.1: one history entry per changed field.
  const history = (
    companyId: string,
    subject: HistorySubject,
    changes: readonly FieldChange[],
    kind: HistoryEntry['kind'],
    who: Actor,
    documentId: string | null,
  ): void => {
    const on = clock.today();
    const entries: HistoryEntry[] = changes.map((change) => ({
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
    }));
    const data = store.read();
    store.write({ ...data, history: [...data.history, ...entries] });
  };

  const created = (companyId: string, subject: HistorySubject, who: Actor): void => {
    history(
      companyId,
      subject,
      [{ path: 'record', oldValue: null, newValue: null }],
      'created',
      who,
      null,
    );
  };

  // A plain update: the audit trail notes the fields; the history is written by updateFields.
  const changedLine = (changes: readonly FieldChange[], of: string): string =>
    `Changed ${fieldList(changes)} for ${of}`;

  // Removing a company takes its offices, people, documents, cards, history and trail with it.
  const removeCompany = (id: string): Promise<void> => {
    const data = store.read();
    const keep = <T extends { companyId: string }>(records: T[]): T[] =>
      records.filter((record) => record.companyId !== id);
    store.write({
      ...data,
      companies: data.companies.filter((company) => company.id !== id),
      offices: keep(data.offices),
      people: keep(data.people),
      documents: keep(data.documents),
      cards: keep(data.cards),
      history: keep(data.history),
      audit: keep(data.audit),
      accountCompanies: keep(data.accountCompanies),
      roles: keep(data.roles),
      onboardingProgress: keep(data.onboardingProgress),
      tasks: keep(data.tasks),
      reminderEmails: keep(data.reminderEmails),
    });
    return Promise.resolve();
  };

  const removeDocument = (id: string, actor: Actor): Promise<void> =>
    settle(() => {
      if (actor.kind !== 'owner') {
        throw new Error('Only an owner can delete a document.');
      }
      const existing = documents.find(id);
      if (existing === null) {
        throw new Error(`documents: no record with id ${id}`);
      }
      const data = store.read();
      store.write({
        ...data,
        documents: data.documents.filter((document) => document.id !== id),
        // An office whose tenancy contract this was no longer points at it.
        offices: data.offices.map((office) =>
          office.lease.tenancyContractDocumentId === id
            ? { ...office, lease: { ...office.lease, tenancyContractDocumentId: null } }
            : office,
        ),
      });
      audit({
        companyId: existing.companyId,
        kind: 'document-deleted',
        summary: `Deleted ${existing.title}`,
        documentId: id,
        personId: existing.personId,
        who: actor,
      });
    });

  const replaceDocument = (id: string, next: DocumentReplacement): Promise<Document> =>
    settle(() => {
      const existing = documents.find(id);
      if (existing === null) {
        throw new Error(`documents: no record with id ${id}`);
      }
      const kept = DocumentVersion.parse({
        version: existing.version,
        title: existing.title,
        fileName: existing.fileName,
        issueDate: existing.issueDate,
        expiryDate: existing.expiryDate,
        uploadedOn: existing.uploadedOn,
        replacedOn: next.uploadedOn,
      });
      const { after } = documents.update(id, {
        title: next.title ?? existing.title,
        fileName: next.fileName,
        issueDate: next.issueDate,
        expiryDate: next.expiryDate,
        uploadedOn: next.uploadedOn,
        version: existing.version + 1,
        extracted: next.extracted === undefined ? existing.extracted : next.extracted,
        previousVersions: [kept, ...(existing.previousVersions ?? [])],
      });
      audit({
        companyId: after.companyId,
        kind: 'document-replaced',
        summary: `Replaced ${after.title}, version ${String(existing.version)} kept`,
        documentId: id,
        personId: after.personId,
      });
      return after;
    });

  // Spec 7.3: a tick, a reference or another change on a card, as one line.
  const cardLine = (before: Card | null, after: Card): void => {
    const label = requirementLabel(after);
    const personId = people.find(after.subjectId ?? '') === null ? null : (after.subjectId ?? null);
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
      audit({
        ...base,
        kind: 'reference-logged',
        summary: `Logged reference ${reference.reference} on ${label}`,
      });
    } else if (ticked.length > 0) {
      const first = ticked[0]?.title ?? '';
      const more = ticked.length > 1 ? ` and ${String(ticked.length - 1)} more` : '';
      audit({ ...base, kind: 'step-ticked', summary: `Ticked "${first}"${more} on ${label}` });
    } else {
      audit({ ...base, kind: 'field-changed', summary: `Updated ${label}` });
    }
  };

  // Spec 7.3: an access change, one line for each company it touches.
  const accessLines = (before: AccessGrant | null, after: AccessGrant): void => {
    const who = `${after.member.name} (${after.roleName})`;
    const had = new Set(before?.companies.map((entry) => entry.companyId) ?? []);
    const has = new Set(after.companies.map((entry) => entry.companyId));
    for (const companyId of new Set([...had, ...has])) {
      const summary = !had.has(companyId)
        ? `Access given to ${who}`
        : !has.has(companyId)
          ? `Access removed for ${who}`
          : `Access changed for ${who}`;
      if (had.has(companyId) && has.has(companyId)) {
        const old = before?.companies.find((entry) => entry.companyId === companyId);
        const now = after.companies.find((entry) => entry.companyId === companyId);
        if (
          JSON.stringify(old) === JSON.stringify(now) &&
          before?.member.name === after.member.name
        ) {
          continue;
        }
      }
      audit({ companyId, kind: 'access-changed', summary });
    }
  };

  function fieldUpdater<T extends { id: string }>(
    repo: WritableRepo<T>,
    subjectKind: HistorySubject['kind'],
    companyOf: (record: T) => string,
    nameOf: (record: T) => string,
    personOf: (record: T) => string | null,
  ) {
    return {
      update: (id: string, patch: Patch<T>): Promise<T> =>
        settle(() => {
          const { before, after } = repo.update(id, patch);
          const changes = fieldChanges(before, after);
          if (changes.length > 0) {
            audit({
              companyId: companyOf(after),
              kind: 'field-changed',
              summary: changedLine(changes, nameOf(after)),
              personId: personOf(after),
            });
          }
          return after;
        }),
      updateFields: (
        id: string,
        patch: Patch<T>,
        kind: FieldChangeKind,
        options: FieldChangeOptions = {},
      ): Promise<T> =>
        settle(() => {
          const who = options.actor ?? currentActor();
          const documentId = options.documentId ?? null;
          const { before, after } = repo.update(id, patch);
          const changes = fieldChanges(before, after);
          if (changes.length > 0) {
            const companyId = companyOf(after);
            history(companyId, { kind: subjectKind, id }, changes, kind, who, documentId);
            audit({
              companyId,
              kind: 'field-changed',
              summary: `${KIND_VERB[kind]} ${fieldList(changes)} for ${nameOf(after)}`,
              personId: personOf(after),
              documentId,
              who,
            });
          }
          return after;
        }),
      create: (input: NewRecord<T>): Promise<T> =>
        settle(() => {
          const who = currentActor();
          const record = repo.create(input);
          const companyId = companyOf(record);
          created(companyId, { kind: subjectKind, id: record.id }, who);
          audit({
            companyId,
            kind: 'field-changed',
            summary: `Added ${nameOf(record)}`,
            personId: personOf(record),
            who,
          });
          return record;
        }),
    };
  }

  const companyFields = fieldUpdater<CompanyFacts>(
    companies,
    'company',
    (record) => record.id,
    (record) => record.identity.tradeName,
    () => null,
  );
  const officeFields = fieldUpdater<Office>(
    offices,
    'office',
    (record) => record.companyId,
    (record) => `the office at ${record.premises.address}`,
    () => null,
  );
  const personFields = fieldUpdater<Person>(
    people,
    'person',
    (record) => record.companyId,
    (record) => record.identity.name,
    (record) => record.id,
  );

  const newestFirst = <T>(records: readonly T[], key: (record: T) => string): T[] =>
    // Reversed first so records stamped alike keep the latest written on top.
    [...records].reverse().sort((a, b) => key(b).localeCompare(key(a)));

  const matches = (entry: HistoryEntry, filter: HistoryFilter): boolean => {
    const subject = filter.subject;
    if (
      subject !== undefined &&
      (entry.subject.kind !== subject.kind || entry.subject.id !== subject.id)
    ) {
      return false;
    }
    const path = filter.fieldPath;
    return path === undefined || entry.fieldPath === path || entry.fieldPath.startsWith(`${path}.`);
  };

  // The companies the signed-in account holds, or null when the session names no email.
  const visible = (): Set<string> | null => {
    const email = session().email;
    if (email === undefined || email === null) {
      return null;
    }
    const data = store.read();
    const account = data.accounts.find(
      (entry) => entry.email.trim().toLowerCase() === email.trim().toLowerCase(),
    );
    return new Set(
      account === undefined
        ? []
        : data.accountCompanies
            .filter((link) => link.accountId === account.id)
            .map((link) => link.companyId),
    );
  };

  const normalLicence = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '');

  return {
    ...onboardingRepos,
    companies: {
      get: companies.get,
      list: () => {
        const ids = visible();
        return Promise.resolve(
          ids === null ? companies.all() : companies.all().filter((company) => ids.has(company.id)),
        );
      },
      create: companyFields.create,
      update: companyFields.update,
      updateFields: companyFields.updateFields,
      remove: removeCompany,
      licenceTaken: (authority, licenceNumber) =>
        Promise.resolve(
          companies
            .all()
            .some(
              (company) =>
                company.identity.authority === authority &&
                normalLicence(company.identity.licenceNumber) === normalLicence(licenceNumber),
            ),
        ),
    },
    offices: {
      get: offices.get,
      list: byCompany(offices.all),
      create: officeFields.create,
      update: officeFields.update,
      updateFields: officeFields.updateFields,
    },
    people: {
      get: people.get,
      list: byCompany(people.all),
      create: personFields.create,
      update: personFields.update,
      updateFields: personFields.updateFields,
    },
    documents: {
      get: documents.get,
      list: byCompany(documents.all),
      create: (input) =>
        settle(() => {
          const record = documents.create(input);
          audit({
            companyId: record.companyId,
            kind: 'document-added',
            summary: `Added ${record.title}`,
            documentId: record.id,
            personId: record.personId,
          });
          return record;
        }),
      update: (id, patch) =>
        settle(() => {
          const { before, after } = documents.update(id, patch);
          const changes = fieldChanges(before, after);
          if (changes.length > 0) {
            audit({
              companyId: after.companyId,
              kind: 'field-changed',
              summary: changedLine(changes, after.title),
              documentId: id,
              personId: after.personId,
            });
          }
          return after;
        }),
      replace: replaceDocument,
      versions: (id) => Promise.resolve(documents.find(id)?.previousVersions ?? []),
      remove: removeDocument,
    },
    access: {
      get: access.get,
      list: () => {
        const ids = visible();
        return Promise.resolve(
          ids === null
            ? access.all()
            : access
                .all()
                .filter((grant) => grant.companies.some((entry) => ids.has(entry.companyId))),
        );
      },
      create: (input) =>
        settle(() => {
          const record = access.create(input);
          accessLines(null, record);
          return record;
        }),
      update: (id, patch) =>
        settle(() => {
          const { before, after } = access.update(id, patch);
          accessLines(before, after);
          return after;
        }),
    },
    cards: {
      get: cards.get,
      list: byCompany(cards.all),
      create: (input) =>
        settle(() => {
          const record = cards.create(input);
          cardLine(null, record);
          return record;
        }),
      update: (id, patch) =>
        settle(() => {
          const { before, after } = cards.update(id, patch);
          cardLine(before, after);
          return after;
        }),
      put: (input) =>
        settle(() => {
          const { before, after } = cards.put(input);
          cardLine(before, after);
          return after;
        }),
    },
    history: {
      list: (companyId, filter = {}) =>
        Promise.resolve(
          newestFirst(
            store
              .read()
              .history.filter((entry) => entry.companyId === companyId && matches(entry, filter)),
            (entry) => entry.on,
          ),
        ),
    },
    audit: {
      list: (companyId) =>
        Promise.resolve(
          newestFirst(
            store.read().audit.filter((event) => event.companyId === companyId),
            (event) => event.when,
          ),
        ),
    },
  };
}
