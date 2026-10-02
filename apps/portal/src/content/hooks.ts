import { useQuery } from '@tanstack/react-query';
import type { AuthorityId } from '@boasis/schema';
import { loadAuthorityFile, loadLibraryEntries } from './content';

// The content a screen reads, through TanStack Query so a file is loaded once and shared.
export function useAuthorityFile(id: AuthorityId | null) {
  return useQuery({
    queryKey: ['content', 'authority', id] as const,
    queryFn: () => (id === null ? Promise.resolve(null) : loadAuthorityFile(id)),
  });
}

export function useLibraryEntries(authority: AuthorityId) {
  return useQuery({
    queryKey: ['content', 'library', authority] as const,
    queryFn: () => loadLibraryEntries(authority),
  });
}
