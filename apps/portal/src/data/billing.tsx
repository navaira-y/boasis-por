import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { BillingSnapshot } from '@boasis/schema';
import { nextSubscriptionClockDelay } from '@boasis/rules';
import { useRepos } from './ReposProvider';
import { clockNow } from '../lib/today';
import { useSession } from '../lib/session';

interface BillingState {
  query: UseQueryResult<BillingSnapshot>;
  now: number;
}
const Context = createContext<BillingState | null>(null);

// One authenticated read and one clock shared by Billing and the header. Identity is
// part of the query key; no previous-account placeholder or subscription fallback.
export function BillingProvider({ children }: { children: ReactNode }) {
  const repos = useRepos();
  const session = useSession();
  const query = useQuery({
    queryKey: ['billing', session?.email ?? ''],
    queryFn: async () => {
      if (repos.billing === undefined) throw new Error('Subscription data is unavailable.');
      return BillingSnapshot.parse(await repos.billing.read());
    },
    enabled: session !== null,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    refetchInterval: 60_000,
  });
  const { refetch } = query;
  const [now, setNow] = useState(() => clockNow());
  const periodEnd = query.data?.subscription?.periodEnd ?? null;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const instant = clockNow();
      setNow(instant);
      timer = setTimeout(sync, nextSubscriptionClockDelay(instant, periodEnd));
    };
    const resume = () => {
      sync();
      if (document.visibilityState === 'visible') void refetch();
    };
    sync();
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [periodEnd, refetch]);
  return <Context.Provider value={{ query, now }}>{children}</Context.Provider>;
}

export function useBilling(): BillingState {
  const value = useContext(Context);
  if (value === null) throw new Error('useBilling requires BillingProvider');
  return value;
}
