import type {
  AccessGrant,
  Account,
  AccountCompany,
  AccountPerson,
  Actor,
  AuthorityId,
  CompanyReminderEmail,
  OnboardingItem,
  OnboardingProgress,
  OnboardingStart,
  OnboardingTask,
  Plan,
  Role,
  WaitlistEntry,
  WhoCanAnswer,
  AuditEvent,
  Card,
  CompanyFacts,
  Document,
  DocumentReplacement,
  DocumentVersion,
  HistoryEntry,
  HistoryKind,
  HistorySubject,
  Office,
  Person,
} from '@boasis/schema';

// One interface per entity. The mock implementation is the reference behaviour; the Supabase
// implementation must satisfy the same interfaces so no screen changes when it arrives.
//
// Every write is made by an actor. Methods that do not take one use the session's actor (the
// owner, or the grant the demo is acting as); the history and the audit trail record it.

export type NewRecord<T extends { id: string }> = Omit<T, 'id'>;
export type Patch<T extends { id: string }> = Partial<Omit<T, 'id'>>;

// Spec 5.1: a field change is a correction or an amendment, or a value confirmed from a document.
export type FieldChangeKind = Exclude<HistoryKind, 'created'>;

export interface FieldChangeOptions {
  // The document the new values came from, if any.
  readonly documentId?: string | null;
  // Who made the change; the session's actor when absent.
  readonly actor?: Actor;
}

export interface HistoryFilter {
  readonly subject?: HistorySubject;
  readonly fieldPath?: string;
}

export interface CompaniesRepo {
  list(): Promise<CompanyFacts[]>;
  get(id: string): Promise<CompanyFacts | null>;
  create(input: NewRecord<CompanyFacts>): Promise<CompanyFacts>;
  update(id: string, patch: Patch<CompanyFacts>): Promise<CompanyFacts>;
  // Updates fields and writes one history entry per changed field, with the kind given.
  updateFields(
    id: string,
    patch: Patch<CompanyFacts>,
    kind: FieldChangeKind,
    options?: FieldChangeOptions,
  ): Promise<CompanyFacts>;
  // Deletes the company and everything filed under it (lite's delete company sheet).
  remove(id: string): Promise<void>;
  // Onboarding v2 step 1: whether a company with this licence number is already on Boasis under
  // this zone. Answers yes or no only; who holds it is never revealed.
  licenceTaken(authority: AuthorityId, licenceNumber: string): Promise<boolean>;
}

export interface OfficesRepo {
  list(companyId: string): Promise<Office[]>;
  get(id: string): Promise<Office | null>;
  create(input: NewRecord<Office>): Promise<Office>;
  update(id: string, patch: Patch<Office>): Promise<Office>;
  updateFields(
    id: string,
    patch: Patch<Office>,
    kind: FieldChangeKind,
    options?: FieldChangeOptions,
  ): Promise<Office>;
}

export interface PeopleRepo {
  list(companyId: string): Promise<Person[]>;
  get(id: string): Promise<Person | null>;
  create(input: NewRecord<Person>): Promise<Person>;
  update(id: string, patch: Patch<Person>): Promise<Person>;
  updateFields(
    id: string,
    patch: Patch<Person>,
    kind: FieldChangeKind,
    options?: FieldChangeOptions,
  ): Promise<Person>;
}

export interface DocumentsRepo {
  list(companyId: string): Promise<Document[]>;
  get(id: string): Promise<Document | null>;
  create(input: NewRecord<Document>): Promise<Document>;
  update(id: string, patch: Patch<Document>): Promise<Document>;
  // Spec 5.3: the new file becomes the current version and the old one is kept.
  replace(id: string, next: DocumentReplacement): Promise<Document>;
  // Earlier versions of a document, newest first; empty for a first version.
  versions(id: string): Promise<DocumentVersion[]>;
  // Spec 5.3: deleting needs an owner. Rejects for any other actor.
  remove(id: string, actor: Actor): Promise<void>;
}

export interface AccessRepo {
  list(): Promise<AccessGrant[]>;
  get(id: string): Promise<AccessGrant | null>;
  create(input: NewRecord<AccessGrant>): Promise<AccessGrant>;
  update(id: string, patch: Patch<AccessGrant>): Promise<AccessGrant>;
}

export interface CardsRepo {
  list(companyId: string): Promise<Card[]>;
  get(id: string): Promise<Card | null>;
  create(input: NewRecord<Card>): Promise<Card>;
  update(id: string, patch: Patch<Card>): Promise<Card>;
  // Writes a card under the id packages/rules gave it (a computed card has no stored row until
  // someone ticks it), replacing any row with that id.
  put(card: Card): Promise<Card>;
}

export interface HistoryRepo {
  // A company's field history, newest first, optionally narrowed to one record or one field.
  list(companyId: string, filter?: HistoryFilter): Promise<HistoryEntry[]>;
}

export interface AuditRepo {
  // A company's audit trail, newest first (spec 7.3).
  list(companyId: string): Promise<AuditEvent[]>;
}

// Onboarding v2 step 0. The account and its companies. The password never reaches this layer's
// storage: the auth adapter below hands it to the auth provider.
export interface AccountsRepo {
  get(id: string): Promise<Account | null>;
  findByEmail(email: string): Promise<Account | null>;
  update(id: string, patch: Patch<Account>): Promise<Account>;
  companies(accountId: string): Promise<AccountCompany[]>;
  linkCompany(link: AccountCompany): Promise<AccountCompany>;
}

export interface SignUpInput {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
  readonly plan: Plan;
  readonly termsVersion: string;
  readonly twoStepOn: boolean;
}

// Sign-up and email verification. The mock creates the account unverified and stands in for the
// emailed link with a verify action; a backend sends the link and verifies its token.
export interface AuthAdapter {
  signUp(input: SignUpInput): Promise<Account>;
  resendVerification(accountId: string): Promise<void>;
  verifyEmail(accountId: string): Promise<Account>;
}

// Step 0: the password is refused when it is found in known leaked-password lists. Pluggable, so
// a real check (for example a k-anonymity range query) replaces the mock without a screen change.
export type BreachResult = 'ok' | 'breached' | 'unavailable';
export interface BreachedPasswordCheck {
  check(password: string): Promise<BreachResult>;
}

// Step 3: one record per human on the account, and each one's part in a company.
export interface AccountPeopleRepo {
  list(accountId: string): Promise<AccountPerson[]>;
  // The people of one company: a role in it, or a visa it sponsors.
  forCompany(companyId: string): Promise<AccountPerson[]>;
  get(id: string): Promise<AccountPerson | null>;
  create(input: NewRecord<AccountPerson>): Promise<AccountPerson>;
  update(id: string, patch: Patch<AccountPerson>): Promise<AccountPerson>;
}

export interface RolesRepo {
  list(companyId: string): Promise<Role[]>;
  listForPerson(personId: string): Promise<Role[]>;
  // One role per person and company: writing again replaces it.
  put(role: Role): Promise<Role>;
  remove(personId: string, companyId: string): Promise<void>;
}

// One open item as the onboarding sees it now; syncing turns the list into tasks.
export interface OpenItem {
  readonly item: OnboardingItem;
  readonly personId: string | null;
  readonly reason: 'unknown' | 'skipped';
  readonly whoCanAnswer: readonly WhoCanAnswer[];
}

export interface OnboardingRepo {
  start(accountId: string): Promise<OnboardingStart | null>;
  saveStart(start: OnboardingStart): Promise<OnboardingStart>;
  clearStart(accountId: string): Promise<void>;
  progress(companyId: string): Promise<OnboardingProgress | null>;
  saveProgress(progress: OnboardingProgress): Promise<OnboardingProgress>;
  tasks(companyId: string): Promise<OnboardingTask[]>;
  // Opens a task for every item in the list that has none, and marks done every open task whose
  // item is no longer in the list. Items are keyed by item and person.
  syncTasks(
    companyId: string,
    items: readonly OpenItem[],
    scope: readonly OnboardingItem[],
  ): Promise<OnboardingTask[]>;
  reminderEmail(companyId: string): Promise<CompanyReminderEmail | null>;
  saveReminderEmail(entry: CompanyReminderEmail): Promise<CompanyReminderEmail>;
  joinWaitlist(entry: NewRecord<WaitlistEntry>): Promise<WaitlistEntry>;
}

export interface Repos {
  accounts: AccountsRepo;
  auth: AuthAdapter;
  passwords: BreachedPasswordCheck;
  accountPeople: AccountPeopleRepo;
  roles: RolesRepo;
  onboarding: OnboardingRepo;
  companies: CompaniesRepo;
  offices: OfficesRepo;
  people: PeopleRepo;
  documents: DocumentsRepo;
  access: AccessRepo;
  cards: CardsRepo;
  history: HistoryRepo;
  audit: AuditRepo;
}
