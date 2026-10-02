import type { AccessGrant, Actor, Area, Person } from '@boasis/schema';
import { useQuery } from '@tanstack/react-query';
import { actingGrantOf, actorFor, can, seesPerson, type GrantOrOwner } from '../lib/access';
import { ownerNameOf, useSession } from '../lib/session';
import { useRepos } from './ReposProvider';
import type { HistoryFilter } from './types';

// TanStack Query hooks for list and get of every entity. Keys are stable arrays so a later
// mutation can invalidate exactly the right lists.
export const queryKeys = {
  companies: () => ['companies'] as const,
  company: (id: string) => ['companies', id] as const,
  offices: (companyId: string) => ['offices', companyId] as const,
  office: (id: string) => ['office', id] as const,
  people: (companyId: string) => ['people', companyId] as const,
  person: (id: string) => ['person', id] as const,
  documents: (companyId: string) => ['documents', companyId] as const,
  document: (id: string) => ['document', id] as const,
  access: () => ['access'] as const,
  grant: (id: string) => ['access', id] as const,
  cards: (companyId: string) => ['cards', companyId] as const,
  card: (id: string) => ['card', id] as const,
  history: (companyId: string, filter: HistoryFilter = {}) =>
    [
      'history',
      companyId,
      filter.subject?.kind ?? null,
      filter.subject?.id ?? null,
      filter.fieldPath ?? null,
    ] as const,
  audit: (companyId: string) => ['audit', companyId] as const,
  documentVersions: (id: string) => ['document', id, 'versions'] as const,
};

export function useCompanies() {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.companies(), queryFn: () => repos.companies.list() });
}

export function useCompany(id: string) {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.company(id), queryFn: () => repos.companies.get(id) });
}

export function useOffices(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.offices(companyId),
    queryFn: () => repos.offices.list(companyId),
  });
}

export function useOffice(id: string) {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.office(id), queryFn: () => repos.offices.get(id) });
}

export function usePeople(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.people(companyId),
    queryFn: () => repos.people.list(companyId),
  });
}

export function usePerson(id: string) {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.person(id), queryFn: () => repos.people.get(id) });
}

export function useDocuments(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.documents(companyId),
    queryFn: () => repos.documents.list(companyId),
  });
}

export function useDocument(id: string) {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.document(id), queryFn: () => repos.documents.get(id) });
}

export function useAccessGrants() {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.access(), queryFn: () => repos.access.list() });
}

export function useAccessGrant(id: string) {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.grant(id), queryFn: () => repos.access.get(id) });
}

export function useCards(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.cards(companyId),
    queryFn: () => repos.cards.list(companyId),
  });
}

export function useCard(id: string) {
  const repos = useRepos();
  return useQuery({ queryKey: queryKeys.card(id), queryFn: () => repos.cards.get(id) });
}

// A company's field history, newest first, optionally narrowed to one record or one field.
export function useCompanyHistory(companyId: string, filter: HistoryFilter = {}) {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.history(companyId, filter),
    queryFn: () => repos.history.list(companyId, filter),
  });
}

// A company's audit trail, newest first (spec 7.3).
export function useAuditTrail(companyId: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.audit(companyId),
    queryFn: () => repos.audit.list(companyId),
  });
}

// The earlier versions of one document, newest first (spec 5.3).
export function useDocumentVersions(id: string) {
  const repos = useRepos();
  return useQuery({
    queryKey: queryKeys.documentVersions(id),
    queryFn: () => repos.documents.versions(id),
  });
}

export interface AccessView {
  // True until the grants have loaded; every check answers false meanwhile.
  readonly pending: boolean;
  // Who the session acts as: the owner, or the grant the demo is acting as.
  readonly actor: Actor;
  readonly grant: AccessGrant | null;
  readonly owner: boolean;
  readonly can: (area: Area, level: 'view' | 'edit') => boolean;
  readonly seesPerson: (person: Person) => boolean;
}

// Spec 4.1 to 4.4: what the current session can do on one company. The signed-in demo user is
// the owner and can do everything; when the session is acting as a member's grant, that grant
// decides.
export function useAccess(companyId: string): AccessView {
  const session = useSession();
  const grants = useAccessGrants();
  const all = grants.data ?? [];
  const actingAs = session?.actingAs ?? null;
  const grant = actingGrantOf(actingAs, all);
  const who: GrantOrOwner = grant ?? 'owner';
  const pending = grants.isPending;
  const ownerName = ownerNameOf(session);
  return {
    pending,
    actor: actorFor(ownerName, actingAs, all),
    grant,
    owner: grant === null,
    can: (area, level) => !pending && can(who, companyId, area, level),
    seesPerson: (person) => !pending && seesPerson(who, person),
  };
}
