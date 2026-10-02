import type {
  Account,
  AccountCompany,
  AccountPerson,
  CompanyFacts,
  OnboardingProgress,
  OnboardingStart,
  OnboardingTask,
  Role,
} from '@boasis/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { loadAuthorityFile } from '../content/content';
import { useSession } from '../lib/session';
import { useRefresh } from './bundles';
import { useRepos } from './ReposProvider';
import type { Repos } from './types';

// Query hooks for the account and the onboarding records (onboarding v2 sections C and F). The
// account is found by the signed-in email, since the session in storage holds the email only.
export const onboardingKeys = {
  all: ['onboarding'] as const,
  account: (email: string) => ['onboarding', 'account', email] as const,
  accountCompanies: (accountId: string) => ['onboarding', 'account-companies', accountId] as const,
  accountPeople: (accountId: string) => ['onboarding', 'account-people', accountId] as const,
  roles: (companyId: string) => ['onboarding', 'roles', companyId] as const,
  start: (accountId: string) => ['onboarding', 'start', accountId] as const,
  progress: (companyId: string) => ['onboarding', 'progress', companyId] as const,
  tasks: (companyId: string) => ['onboarding', 'tasks', companyId] as const,
  reminderEmail: (companyId: string) => ['onboarding', 'reminder-email', companyId] as const,
};

export function useAccount() {
  const repos = useRepos();
  const session = useSession();
  const email = session?.email ?? '';
  return useQuery({
    queryKey: onboardingKeys.account(email),
    queryFn: () => (email === '' ? Promise.resolve(null) : repos.accounts.findByEmail(email)),
  });
}

export function useAccountCompanies(accountId: string | null) {
  const repos = useRepos();
  return useQuery({
    queryKey: onboardingKeys.accountCompanies(accountId ?? ''),
    queryFn: () => (accountId === null ? Promise.resolve([]) : repos.accounts.companies(accountId)),
  });
}

export function useAccountPeople(accountId: string | null) {
  const repos = useRepos();
  return useQuery({
    queryKey: onboardingKeys.accountPeople(accountId ?? ''),
    queryFn: () => (accountId === null ? Promise.resolve([]) : repos.accountPeople.list(accountId)),
  });
}

export function useRoles(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: onboardingKeys.roles(companyId),
    queryFn: () => repos.roles.list(companyId),
  });
}

export function useOnboardingStart(accountId: string | null) {
  const repos = useRepos();
  return useQuery({
    queryKey: onboardingKeys.start(accountId ?? ''),
    queryFn: () => (accountId === null ? Promise.resolve(null) : repos.onboarding.start(accountId)),
  });
}

export function useOnboardingProgress(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: onboardingKeys.progress(companyId),
    queryFn: () => repos.onboarding.progress(companyId),
  });
}

export function useOnboardingTasks(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: onboardingKeys.tasks(companyId),
    queryFn: () => repos.onboarding.tasks(companyId),
  });
}

export function useReminderEmail(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: onboardingKeys.reminderEmail(companyId),
    queryFn: () => repos.onboarding.reminderEmail(companyId),
  });
}

// After an onboarding write: every onboarding record, and every company bundle, is read again.
export function useOnboardingRefresh(): () => Promise<void> {
  const client = useQueryClient();
  const refresh = useRefresh();
  return useCallback(async () => {
    await Promise.all([client.invalidateQueries({ queryKey: onboardingKeys.all }), refresh()]);
  }, [client, refresh]);
}

// Everything the onboarding screens read for one account, in one query: the account, its
// companies with their facts, every person on the account and their roles, the open tasks and
// the progress. The combined year (step 8) needs all of it at once.
export interface OnboardingWorld {
  readonly account: Account;
  readonly links: readonly AccountCompany[];
  readonly companies: readonly CompanyFacts[];
  readonly people: readonly AccountPerson[];
  readonly roles: readonly Role[];
  readonly tasks: readonly OnboardingTask[];
  readonly progress: readonly OnboardingProgress[];
  readonly start: OnboardingStart | null;
}

async function loadWorld(repos: Repos, account: Account): Promise<OnboardingWorld> {
  const links = await repos.accounts.companies(account.id);
  const companies = (
    await Promise.all(links.map((link) => repos.companies.get(link.companyId)))
  ).filter((facts): facts is CompanyFacts => facts !== null);
  const [people, start] = await Promise.all([
    repos.accountPeople.list(account.id),
    repos.onboarding.start(account.id),
  ]);
  const perCompany = await Promise.all(
    companies.map(async (facts) => ({
      roles: await repos.roles.list(facts.id),
      tasks: await repos.onboarding.tasks(facts.id),
      progress: await repos.onboarding.progress(facts.id),
    })),
  );
  return {
    account,
    links,
    companies,
    people,
    roles: perCompany.flatMap((entry) => entry.roles),
    tasks: perCompany.flatMap((entry) => entry.tasks),
    progress: perCompany.flatMap((entry) => (entry.progress === null ? [] : [entry.progress])),
    start,
  };
}

export function useOnboardingWorld(account: Account | null | undefined) {
  const repos = useRepos();
  return useQuery({
    queryKey: ['onboarding', 'world', account?.id ?? '', account?.plan ?? ''],
    queryFn: () => (account == null ? Promise.resolve(null) : loadWorld(repos, account)),
    enabled: account !== undefined,
  });
}

// The authority file of a zone, or null when the zone has no deep file yet.
export function useAuthorityFile(id: string | null) {
  return useQuery({
    queryKey: ['onboarding', 'authority', id ?? ''],
    queryFn: () => (id === null ? Promise.resolve(null) : loadAuthorityFile(id)),
  });
}
