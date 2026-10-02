import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createRepos } from './createRepos';
import type { Repos } from './types';

const ReposContext = createContext<Repos | null>(null);

type State =
  { status: 'loading' } | { status: 'ready'; repos: Repos } | { status: 'error'; message: string };

export function ReposProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    createRepos()
      .then((repos) => {
        if (!cancelled) {
          setState({ status: 'ready', repos });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return <p role="status">Loading</p>;
  }
  if (state.status === 'error') {
    return <p role="alert">{state.message}</p>;
  }
  return <ReposContext.Provider value={state.repos}>{children}</ReposContext.Provider>;
}

export function useRepos(): Repos {
  const repos = useContext(ReposContext);
  if (repos === null) {
    throw new Error('useRepos must be used inside ReposProvider');
  }
  return repos;
}
