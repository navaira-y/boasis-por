import { useQueries, useQueryClient } from '@tanstack/react-query';
import { computeCards } from '@boasis/rules';
import { useCallback } from 'react';
import type { Bundle, Entry } from '../lib/entries';
import { entriesOf } from '../lib/entries';
import { withStoredOccurrences } from '../lib/occurrences';
import { today } from '../lib/today';
import { loadAuthority } from './content';
import { federalRules } from '../content/federal';
import { companyPeople, snapshotOf } from '../lib/onboarding/snapshot';
import { useCompanies, queryKeys } from './hooks';
import { useRepos } from './ReposProvider';
import type { Repos } from './types';

// One bundle per company: the file, its offices, people and documents, the authority file, and
// the cards computed from them today. Every home and company screen reads from here, so the
// dial, the timeline and the sheets never disagree about a date.

// No published holiday list in content/ yet: the act-by date falls back to the weekend rule.
const HOLIDAYS: readonly string[] = [];

export const bundleKey = (companyId: string, day: string) => ['bundle', companyId, day] as const;

async function loadBundle(repos: Repos, companyId: string, day: string): Promise<Bundle> {
  const facts = await repos.companies.get(companyId);
  if (facts === null) {
    throw new Error(`no company with id ${companyId}`);
  }
  const [offices, people, documents, stored, authority, accountPeople, roles] = await Promise.all([
    repos.offices.list(companyId),
    repos.people.list(companyId),
    repos.documents.list(companyId),
    repos.cards.list(companyId),
    loadAuthority(facts.identity.authority),
    repos.accountPeople.forCompany(companyId),
    repos.roles.list(companyId),
  ]);
  // Onboarding v2: a company with onboarding answers takes its items from them, the same computed
  // dates the onboarding's year shows.
  const onboarding =
    facts.profile == null
      ? null
      : snapshotOf(facts, companyPeople(companyId, accountPeople, roles));
  // Plus the next occurrences stored when a card was closed (spec 7.3, lib/occurrences).
  const cards = withStoredOccurrences(
    computeCards({
      facts,
      offices,
      people,
      documents,
      existingCards: stored,
      authority,
      federal: federalRules,
      today: day,
      holidays: HOLIDAYS,
      onboarding,
    }),
    stored,
    day,
    HOLIDAYS,
  );
  return { facts, offices, people, documents, authority, cards, stored };
}

export interface CompanyView {
  readonly bundle: Bundle;
  readonly entries: Entry[];
}

export interface HomeData {
  readonly today: string;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly companies: CompanyView[];
}

// Every company the person can see, each with its bundle and entries.
export function useHomeData(): HomeData {
  const repos = useRepos();
  const day = today();
  const companies = useCompanies();
  const ids = companies.data?.map((company) => company.id) ?? [];
  const queries = useQueries({
    queries: ids.map((id) => ({
      queryKey: bundleKey(id, day),
      queryFn: () => loadBundle(repos, id, day),
    })),
  });
  const pending = companies.isPending || queries.some((query) => query.isPending);
  const failed = queries.find((query) => query.isError);
  const error = companies.isError ? companies.error : (failed?.error ?? null);
  const loaded = queries.flatMap((query) =>
    query.data === undefined ? [] : [{ bundle: query.data, entries: entriesOf(query.data, day) }],
  );
  return { today: day, pending, error, companies: loaded };
}

// One company, by id. Null while loading; undefined when there is no such company.
export function useCompanyData(companyId: string): {
  readonly today: string;
  readonly view: CompanyView | null | undefined;
  readonly error: Error | null;
  readonly all: CompanyView[];
} {
  const home = useHomeData();
  const view = home.companies.find((company) => company.bundle.facts.id === companyId);
  const known = home.pending ? null : (view ?? undefined);
  return { today: home.today, view: known, error: home.error, all: home.companies };
}

// After any write: every bundle, list, record, history and audit trail is read again.
export function useRefresh(): () => Promise<void> {
  const client = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['bundle'] }),
      client.invalidateQueries({ queryKey: queryKeys.companies() }),
      client.invalidateQueries({ queryKey: ['cards'] }),
      client.invalidateQueries({ queryKey: ['documents'] }),
      client.invalidateQueries({ queryKey: ['people'] }),
      client.invalidateQueries({ queryKey: ['offices'] }),
      client.invalidateQueries({ queryKey: ['office'] }),
      client.invalidateQueries({ queryKey: ['person'] }),
      client.invalidateQueries({ queryKey: ['document'] }),
      client.invalidateQueries({ queryKey: ['card'] }),
      client.invalidateQueries({ queryKey: queryKeys.access() }),
      client.invalidateQueries({ queryKey: ['history'] }),
      client.invalidateQueries({ queryKey: ['audit'] }),
    ]);
  }, [client]);
}
