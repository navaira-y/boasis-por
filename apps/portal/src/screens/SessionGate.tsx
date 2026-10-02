import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAccount } from '../data/onboarding';
import { useSession } from '../lib/session';

// Lite shows the gate whenever there is no session. The gate route itself stays reachable.
// Onboarding v2 step 0: an account whose email is not verified yet is held on the verify screen.
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const account = useAccount();
  const location = useLocation();
  if (session === null && location.pathname !== '/auth') {
    return <Navigate to="/auth" replace />;
  }
  const unverified = account.data?.emailVerifiedOn === null;
  if (session !== null && unverified && location.pathname !== '/verify') {
    return <Navigate to="/verify" replace />;
  }
  return <>{children}</>;
}
