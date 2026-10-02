import {
  Account,
  AccountCompany,
  AccountPerson,
  CompanyReminderEmail,
  OnboardingProgress,
  OnboardingStart,
  OnboardingTask,
  Role,
  WaitlistEntry,
  type IsoDate,
} from '@boasis/schema';
import type {
  AccountPeopleRepo,
  AccountsRepo,
  AuthAdapter,
  BreachedPasswordCheck,
  OnboardingRepo,
  RolesRepo,
} from '../types';
import type { MockStore } from './store';

// The mock of the account and onboarding records (onboarding v2 sections C and F). Every write is
// validated against the schema, like the company records, so the mock never holds a shape a
// screen cannot trust.

function settle<T>(work: () => T): Promise<T> {
  try {
    return Promise.resolve(work());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

function newId(): string {
  return crypto.randomUUID();
}

const sameEmail = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export interface OnboardingRepos {
  accounts: AccountsRepo;
  auth: AuthAdapter;
  passwords: BreachedPasswordCheck;
  accountPeople: AccountPeopleRepo;
  roles: RolesRepo;
  onboarding: OnboardingRepo;
}

export function createOnboardingRepos(store: MockStore, today: () => IsoDate): OnboardingRepos {
  const data = () => store.read();

  const findAccount = (id: string): Account | null =>
    data().accounts.find((account) => account.id === id) ?? null;

  const updateAccount = (id: string, patch: Partial<Omit<Account, 'id'>>): Account => {
    const existing = findAccount(id);
    if (existing === null) {
      throw new Error(`accounts: no record with id ${id}`);
    }
    const next = Account.parse({ ...existing, ...patch, id });
    store.write({
      ...data(),
      accounts: data().accounts.map((account) => (account.id === id ? next : account)),
    });
    return next;
  };

  const accounts: AccountsRepo = {
    get: (id) => Promise.resolve(findAccount(id)),
    findByEmail: (email) =>
      Promise.resolve(data().accounts.find((account) => sameEmail(account.email, email)) ?? null),
    update: (id, patch) => settle(() => updateAccount(id, patch)),
    companies: (accountId) =>
      Promise.resolve(data().accountCompanies.filter((link) => link.accountId === accountId)),
    linkCompany: (input) =>
      settle(() => {
        const link = AccountCompany.parse(input);
        const rest = data().accountCompanies.filter(
          (current) =>
            !(current.accountId === link.accountId && current.companyId === link.companyId),
        );
        store.write({ ...data(), accountCompanies: [...rest, link] });
        return link;
      }),
  };

  // The mock accepts the password and forgets it: sign-in in the mock takes any password.
  const auth: AuthAdapter = {
    signUp: (input) =>
      settle(() => {
        if (data().accounts.some((account) => sameEmail(account.email, input.email))) {
          throw new Error('An account with this email already exists. Sign in instead.');
        }
        const day = today();
        const account = Account.parse({
          id: newId(),
          fullName: input.fullName.trim(),
          email: input.email.trim(),
          plan: input.plan,
          termsVersion: input.termsVersion,
          termsAcceptedOn: day,
          emailVerifiedOn: null,
          twoStepOn: input.twoStepOn,
          emailRemindersOn: true,
          createdOn: day,
        });
        store.write({ ...data(), accounts: [...data().accounts, account] });
        return account;
      }),
    resendVerification: (accountId) =>
      settle(() => {
        if (findAccount(accountId) === null) {
          throw new Error(`accounts: no record with id ${accountId}`);
        }
      }),
    verifyEmail: (accountId) =>
      settle(() => updateAccount(accountId, { emailVerifiedOn: today() })),
  };

  // The mock finds no password in any leak list.
  const passwords: BreachedPasswordCheck = {
    check: () => Promise.resolve('ok'),
  };

  const findPerson = (id: string): AccountPerson | null =>
    data().accountPeople.find((person) => person.id === id) ?? null;

  const accountPeople: AccountPeopleRepo = {
    list: (accountId) =>
      Promise.resolve(data().accountPeople.filter((person) => person.accountId === accountId)),
    forCompany: (companyId) => {
      const withRole = new Set(
        data()
          .roles.filter((role) => role.companyId === companyId)
          .map((role) => role.personId),
      );
      return Promise.resolve(
        data().accountPeople.filter(
          (person) =>
            withRole.has(person.id) ||
            (person.residenceVisa.sponsor.kind === 'account-company' &&
              person.residenceVisa.sponsor.companyId === companyId),
        ),
      );
    },
    get: (id) => Promise.resolve(findPerson(id)),
    create: (input) =>
      settle(() => {
        const person = AccountPerson.parse({ ...input, id: newId() });
        store.write({ ...data(), accountPeople: [...data().accountPeople, person] });
        return person;
      }),
    update: (id, patch) =>
      settle(() => {
        const existing = findPerson(id);
        if (existing === null) {
          throw new Error(`accountPeople: no record with id ${id}`);
        }
        const next = AccountPerson.parse({ ...existing, ...patch, id });
        store.write({
          ...data(),
          accountPeople: data().accountPeople.map((person) => (person.id === id ? next : person)),
        });
        return next;
      }),
  };

  const roles: RolesRepo = {
    list: (companyId) =>
      Promise.resolve(data().roles.filter((role) => role.companyId === companyId)),
    listForPerson: (personId) =>
      Promise.resolve(data().roles.filter((role) => role.personId === personId)),
    put: (input) =>
      settle(() => {
        const role = Role.parse(input);
        const rest = data().roles.filter(
          (current) =>
            !(current.personId === role.personId && current.companyId === role.companyId),
        );
        store.write({ ...data(), roles: [...rest, role] });
        return role;
      }),
    remove: (personId, companyId) =>
      settle(() => {
        store.write({
          ...data(),
          roles: data().roles.filter(
            (role) => !(role.personId === personId && role.companyId === companyId),
          ),
        });
      }),
  };

  const onboarding: OnboardingRepo = {
    start: (accountId) =>
      Promise.resolve(
        data().onboardingStarts.find((start) => start.accountId === accountId) ?? null,
      ),
    saveStart: (input) =>
      settle(() => {
        const start = OnboardingStart.parse(input);
        const rest = data().onboardingStarts.filter((entry) => entry.accountId !== start.accountId);
        store.write({ ...data(), onboardingStarts: [...rest, start] });
        return start;
      }),
    clearStart: (accountId) =>
      settle(() => {
        store.write({
          ...data(),
          onboardingStarts: data().onboardingStarts.filter(
            (entry) => entry.accountId !== accountId,
          ),
        });
      }),
    progress: (companyId) =>
      Promise.resolve(
        data().onboardingProgress.find((entry) => entry.companyId === companyId) ?? null,
      ),
    saveProgress: (input) =>
      settle(() => {
        const progress = OnboardingProgress.parse(input);
        const rest = data().onboardingProgress.filter(
          (entry) => entry.companyId !== progress.companyId,
        );
        store.write({ ...data(), onboardingProgress: [...rest, progress] });
        return progress;
      }),
    tasks: (companyId) =>
      Promise.resolve(data().tasks.filter((task) => task.companyId === companyId)),
    syncTasks: (companyId, items, scope) =>
      settle(() => {
        const day = today();
        const key = (item: string, personId: string | null) => `${item}:${personId ?? ''}`;
        const wanted = new Map(items.map((entry) => [key(entry.item, entry.personId), entry]));
        const inScope = new Set<string>(scope);
        const others = data().tasks.filter((task) => task.companyId !== companyId);
        const mine = data().tasks.filter((task) => task.companyId === companyId);
        const next: OnboardingTask[] = mine.map((task) => {
          const entry = wanted.get(key(task.item, task.personId));
          if (entry !== undefined) {
            wanted.delete(key(task.item, task.personId));
            return OnboardingTask.parse({
              ...task,
              reason: entry.reason,
              whoCanAnswer: [...entry.whoCanAnswer],
              status: task.status === 'dismissed' ? 'dismissed' : 'open',
            });
          }
          return inScope.has(task.item) && task.status === 'open'
            ? { ...task, status: 'done' as const }
            : task;
        });
        for (const entry of wanted.values()) {
          next.push(
            OnboardingTask.parse({
              id: newId(),
              companyId,
              item: entry.item,
              personId: entry.personId,
              reason: entry.reason,
              whoCanAnswer: [...entry.whoCanAnswer],
              status: 'open',
              createdOn: day,
            }),
          );
        }
        store.write({ ...data(), tasks: [...others, ...next] });
        return next;
      }),
    reminderEmail: (companyId) =>
      Promise.resolve(data().reminderEmails.find((entry) => entry.companyId === companyId) ?? null),
    saveReminderEmail: (input) =>
      settle(() => {
        const entry = CompanyReminderEmail.parse(input);
        const rest = data().reminderEmails.filter(
          (current) => current.companyId !== entry.companyId,
        );
        store.write({ ...data(), reminderEmails: [...rest, entry] });
        return entry;
      }),
    joinWaitlist: (input) =>
      settle(() => {
        const entry = WaitlistEntry.parse({ ...input, id: newId() });
        store.write({ ...data(), waitlist: [...data().waitlist, entry] });
        return entry;
      }),
  };

  return { accounts, auth, passwords, accountPeople, roles, onboarding };
}
