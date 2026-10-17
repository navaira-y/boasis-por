import { useQuery } from '@tanstack/react-query';
import { CompanyCreationAccess } from '@boasis/schema';
import { useRepos } from './ReposProvider';
import { useSession } from '../lib/session';

// The allowance RPC is authoritative, including temporary gateway restrictions.
// Counts are owned companies, not every shared company visible in the portal.
export function useCompanyAllowance() {
  const repos = useRepos();
  const session = useSession();
  return useQuery({
    queryKey: ['company-allowance-summary', session?.email ?? ''],
    queryFn: async () => {
      if (repos.companies.creationAccess === undefined)
        throw new Error('Company allowance unavailable');
      return CompanyCreationAccess.parse(await repos.companies.creationAccess());
    },
    enabled: session !== null && repos.companies.creationAccess !== undefined,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: 'always',
  });
}
