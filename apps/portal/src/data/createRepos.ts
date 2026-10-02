import { ownerNameOf, readSession } from '../lib/session';
import type { Repos } from './types';

// Mock in development unless VITE_DATA_MODE says supabase. The mock module is only reachable
// behind import.meta.env.DEV, so a production build drops it entirely. The mock reads the
// session on every write, so the history and the audit trail name the owner, or the member the
// demo is acting as.
export async function createRepos(): Promise<Repos> {
  if (import.meta.env.DEV && import.meta.env.VITE_DATA_MODE !== 'supabase') {
    const { createMockRepos, localStorageAdapter } = await import('./mock/repos');
    return createMockRepos(localStorageAdapter(), () => {
      const session = readSession();
      return {
        ownerName: ownerNameOf(session),
        actingAs: session?.actingAs ?? null,
        email: session?.email ?? '',
      };
    });
  }
  throw new Error('Supabase data layer not implemented yet');
}
