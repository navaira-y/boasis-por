import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { BillingProvider } from '../data/billing';
import { ReposProvider } from '../data/ReposProvider';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <ReposProvider>
        <BillingProvider>{children}</BillingProvider>
      </ReposProvider>
    </QueryClientProvider>
  );
}
