import {
  AccountPerson,
  CompanyReminderEmail,
  OnboardingProgress,
  OnboardingStart,
  OnboardingTask,
  Role,
  WaitlistEntry,
} from '@boasis/schema';
import type {
  AccountPeopleRepo,
  OnboardingRepo,
  RolesRepo,
} from '../types';
import { today } from '../../lib/today';
import { requireUser } from './actor';
import { supabase } from './client';
import {
  docOf,
  newId,
  noRecord,
  parseOrWarn,
  rethrow,
  requireOwnCompany,
  type PostgrestError,
} from './util';

// The onboarding records (onboarding v2 sections C and F): people on the
// account, their part in each company, starts, progress, tasks, reminder
// addresses and the waitlist. Behaviour mirrors the mock's onboarding repos.

// ---------------------------------------------------------- account people --

interface PersonRow {
  readonly id: string;
  readonly account_id: string;
  readonly data: unknown;
}

async function listOwnPeople(userId: string): Promise<AccountPerson[]> {
  const { data, error } = await supabase()
    .from('portal_account_people')
    .select('id, data')
    .eq('account_id', userId)
    .order('created_at', { ascending: true });
  rethrow(error as PostgrestError | null);
  const people: AccountPerson[] = [];
  for (const row of (data ?? []) as PersonRow[]) {
    const person = parseOrWarn(AccountPerson, 'accountPeople', row.id, docOf(row, row.id));
    if (person !== null) {
      people.push(person);
    }
  }
  return people;
}

async function readOwnPerson(id: string): Promise<AccountPerson | null> {
  const { data, error } = await supabase()
    .from('portal_account_people')
    .select('id, data')
    .eq('id', id)
    .maybeSingle();
  rethrow(error as PostgrestError | null);
  if (data === null || data === undefined) {
    return null;
  }
  const row = data as PersonRow;
  return parseOrWarn(AccountPerson, 'accountPeople', row.id, docOf(row, row.id));
}

export const accountPeople: AccountPeopleRepo = {
  list: async (accountId) => {
    const user = await requireUser();
    if (accountId !== user.id) {
      return [];
    }
    return listOwnPeople(user.id);
  },
  // The people of one company: a role in it, or a visa it sponsors.
  forCompany: async (companyId) => {
    const user = await requireUser();
    const { data, error } = await supabase()
      .from('portal_roles')
      .select('person_id')
      .eq('company_id', companyId);
    rethrow(error as PostgrestError | null);
    const withRole = new Set(
      ((data ?? []) as { person_id: string }[]).map((row) => row.person_id),
    );
    return (await listOwnPeople(user.id)).filter(
      (person) =>
        withRole.has(person.id) ||
        (person.residenceVisa.sponsor.kind === 'account-company' &&
          person.residenceVisa.sponsor.companyId === companyId),
    );
  },
  get: (id) => readOwnPerson(id),
  create: async (input) => {
    const user = await requireUser();
    const person = AccountPerson.parse({ ...input, id: newId() });
    if (person.accountId !== user.id) {
      throw new Error('People belong to your own account.');
    }
    const { error } = await supabase().from('portal_account_people').insert({
      id: person.id,
      account_id: person.accountId,
      data: person,
    });
    rethrow(error as PostgrestError | null);
    return person;
  },
  update: async (id, patch) => {
    const existing = (await readOwnPerson(id)) ?? noRecord('accountPeople', id);
    const next = AccountPerson.parse({ ...existing, ...patch, id });
    const { error } = await supabase()
      .from('portal_account_people')
      .update({ data: next })
      .eq('id', id);
    rethrow(error as PostgrestError | null);
    return next;
  },
};

// ------------------------------------------------------------------- roles --

async function readRoles(companyId: string): Promise<Role[]> {
  const { data, error } = await supabase()
    .from('portal_roles')
    .select('person_id, company_id, data')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  rethrow(error as PostgrestError | null);
  const roles: Role[] = [];
  for (const row of (data ?? []) as {
    person_id: string;
    company_id: string;
    data: unknown;
  }[]) {
    const role = parseOrWarn(Role, 'roles', `${row.person_id}:${row.company_id}`, {
      ...(typeof row.data === 'object' && row.data !== null
        ? (row.data as Record<string, unknown>)
        : {}),
      personId: row.person_id,
      companyId: row.company_id,
    });
    if (role !== null) {
      roles.push(role);
    }
  }
  return roles;
}

export const roles: RolesRepo = {
  list: (companyId) => readRoles(companyId),
  listForPerson: async (personId) => {
    const { data, error } = await supabase()
      .from('portal_roles')
      .select('person_id, company_id, data')
      .eq('person_id', personId)
      .order('created_at', { ascending: true });
    rethrow(error as PostgrestError | null);
    const found: Role[] = [];
    for (const row of (data ?? []) as {
      person_id: string;
      company_id: string;
      data: unknown;
    }[]) {
      const role = parseOrWarn(Role, 'roles', `${row.person_id}:${row.company_id}`, {
        ...(typeof row.data === 'object' && row.data !== null
          ? (row.data as Record<string, unknown>)
          : {}),
        personId: row.person_id,
        companyId: row.company_id,
      });
      if (role !== null) {
        found.push(role);
      }
    }
    return found;
  },
  // One role per person and company: writing again replaces it.
  put: async (input) => {
    await requireUser();
    const role = Role.parse(input);
    await requireOwnCompany(role.companyId);
    const { error } = await supabase().from('portal_roles').upsert(
      { person_id: role.personId, company_id: role.companyId, data: role },
      { onConflict: 'person_id,company_id' },
    );
    rethrow(error as PostgrestError | null);
    return role;
  },
  remove: async (personId, companyId) => {
    const { error } = await supabase()
      .from('portal_roles')
      .delete()
      .eq('person_id', personId)
      .eq('company_id', companyId);
    rethrow(error as PostgrestError | null);
  },
};

// --------------------------------------------------------------- onboarding --

interface TaskRow {
  readonly id: string;
  readonly company_id: string;
  readonly data: unknown;
}

async function readTasks(companyId: string): Promise<OnboardingTask[]> {
  const { data, error } = await supabase()
    .from('portal_tasks')
    .select('id, data')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });
  rethrow(error as PostgrestError | null);
  const tasks: OnboardingTask[] = [];
  for (const row of (data ?? []) as TaskRow[]) {
    const task = parseOrWarn(OnboardingTask, 'tasks', row.id, docOf(row, row.id));
    if (task !== null) {
      tasks.push(task);
    }
  }
  return tasks;
}

export const onboarding: OnboardingRepo = {
  start: async (accountId) => {
    const user = await requireUser();
    if (accountId !== user.id) {
      return null;
    }
    const { data, error } = await supabase()
      .from('portal_onboarding_starts')
      .select('data')
      .eq('account_id', user.id)
      .maybeSingle();
    rethrow(error as PostgrestError | null);
    if (data === null || data === undefined) {
      return null;
    }
    const row = data as { data: unknown };
    return parseOrWarn(
      OnboardingStart,
      'onboardingStarts',
      user.id,
      typeof row.data === 'object' && row.data !== null
        ? { ...(row.data as Record<string, unknown>), accountId: user.id }
        : { accountId: user.id },
    );
  },
  saveStart: async (input) => {
    const user = await requireUser();
    const start = OnboardingStart.parse(input);
    if (start.accountId !== user.id) {
      throw new Error('A start belongs to your own account.');
    }
    const { error } = await supabase()
      .from('portal_onboarding_starts')
      .upsert({ account_id: start.accountId, data: start }, { onConflict: 'account_id' });
    rethrow(error as PostgrestError | null);
    return start;
  },
  clearStart: async (accountId) => {
    const user = await requireUser();
    if (accountId !== user.id) {
      return;
    }
    const { error } = await supabase()
      .from('portal_onboarding_starts')
      .delete()
      .eq('account_id', user.id);
    rethrow(error as PostgrestError | null);
  },
  progress: async (companyId) => {
    const { data, error } = await supabase()
      .from('portal_onboarding_progress')
      .select('data')
      .eq('company_id', companyId)
      .maybeSingle();
    rethrow(error as PostgrestError | null);
    if (data === null || data === undefined) {
      return null;
    }
    const row = data as { data: unknown };
    return parseOrWarn(
      OnboardingProgress,
      'onboardingProgress',
      companyId,
      typeof row.data === 'object' && row.data !== null
        ? { ...(row.data as Record<string, unknown>), companyId }
        : { companyId },
    );
  },
  saveProgress: async (input) => {
    const progress = OnboardingProgress.parse(input);
    await requireOwnCompany(progress.companyId);
    const { error } = await supabase()
      .from('portal_onboarding_progress')
      .upsert(
        { company_id: progress.companyId, data: progress },
        { onConflict: 'company_id' },
      );
    rethrow(error as PostgrestError | null);
    return progress;
  },
  tasks: (companyId) => readTasks(companyId),
  // Opens a task for every item in the list that has none, and marks done
  // every open task whose item is no longer in the list. Items are keyed by
  // item and person. Nothing is ever deleted: done and dismissed stay.
  syncTasks: async (companyId, items, scope) => {
    await requireOwnCompany(companyId);
    const day = today();
    const key = (item: string, personId: string | null): string =>
      `${item}:${personId ?? ''}`;
    const wanted = new Map(items.map((entry) => [key(entry.item, entry.personId), entry]));
    const inScope = new Set<string>(scope);
    const next: OnboardingTask[] = [];
    for (const task of await readTasks(companyId)) {
      const entry = wanted.get(key(task.item, task.personId));
      if (entry !== undefined) {
        wanted.delete(key(task.item, task.personId));
        next.push(
          OnboardingTask.parse({
            ...task,
            reason: entry.reason,
            whoCanAnswer: [...entry.whoCanAnswer],
            status: task.status === 'dismissed' ? 'dismissed' : 'open',
          }),
        );
      } else if (inScope.has(task.item) && task.status === 'open') {
        next.push({ ...task, status: 'done' as const });
      } else {
        next.push(task);
      }
    }
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
    if (next.length > 0) {
      const { error } = await supabase()
        .from('portal_tasks')
        .upsert(next.map((task) => ({ id: task.id, company_id: task.companyId, data: task })));
      rethrow(error as PostgrestError | null);
    }
    return next;
  },
  reminderEmail: async (companyId) => {
    const { data, error } = await supabase()
      .from('portal_reminder_emails')
      .select('data')
      .eq('company_id', companyId)
      .maybeSingle();
    rethrow(error as PostgrestError | null);
    if (data === null || data === undefined) {
      return null;
    }
    const row = data as { data: unknown };
    return parseOrWarn(
      CompanyReminderEmail,
      'reminderEmails',
      companyId,
      typeof row.data === 'object' && row.data !== null
        ? { ...(row.data as Record<string, unknown>), companyId }
        : { companyId },
    );
  },
  saveReminderEmail: async (input) => {
    const entry = CompanyReminderEmail.parse(input);
    await requireOwnCompany(entry.companyId);
    const { error } = await supabase()
      .from('portal_reminder_emails')
      .upsert(
        { company_id: entry.companyId, data: entry },
        { onConflict: 'company_id' },
      );
    rethrow(error as PostgrestError | null);
    return entry;
  },
  joinWaitlist: async (input) => {
    const user = await requireUser();
    const entry = WaitlistEntry.parse({ ...input, id: newId() });
    if (entry.accountId !== user.id) {
      throw new Error('A waitlist entry belongs to your own account.');
    }
    const { error } = await supabase().from('portal_waitlist').insert({
      id: entry.id,
      account_id: entry.accountId,
      data: entry,
    });
    rethrow(error as PostgrestError | null);
    return entry;
  },
};
