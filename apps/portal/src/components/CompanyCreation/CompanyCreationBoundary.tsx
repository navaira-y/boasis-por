import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { CompanyCreationAccess } from '@boasis/schema';
import { useRepos } from '../../data/ReposProvider';
import { useSession } from '../../lib/session';
import { Button } from '../Button/Button';
import { Sheet } from '../Sheet/Sheet';

/**
 * One allowance check for all new-company doors and sheets. No form fields or
 * layout changes. The database trigger is authoritative, including when two
 * already-open forms submit together; this read is only the early UX guard.
 */
export function CompanyCreationBoundary({ children, onClose, enabled = true }: {
  readonly children: ReactNode;
  readonly onClose?: () => void;
  readonly enabled?: boolean;
}) {
  const repos = useRepos();
  const session = useSession();
  const navigate = useNavigate();
  const access = useQuery({
    queryKey: ['company-creation', session?.email ?? ''],
    queryFn: async () => {
      if (repos.companies.creationAccess !== undefined) {
        return CompanyCreationAccess.parse(await repos.companies.creationAccess());
      }
      // The unchanged development gallery has no payment backend. Production
      // must never fall back to an assumed allowance when the RPC is missing.
      if (import.meta.env.DEV) {
        return CompanyCreationAccess.parse({ canCreate: true, reason: 'allowed', ownedCompanies: 0, companyLimit: 1 });
      }
      throw new Error('Company allowance is unavailable.');
    },
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const close = onClose ?? (() => { void navigate('/companies', { replace: true }); });

  if (!enabled) return <>{children}</>;
  if (access.isPending || access.isFetching) {
    return <p className="status" role="status">Checking company allowance...</p>;
  }
  if (!access.isError && access.data.canCreate) return <>{children}</>;

  const paymentSoon = access.data?.reason === 'payment-coming-soon';
  const title = access.isError ? 'Could not check your company allowance'
    : paymentSoon ? 'Online payment opens soon' : 'Your access needs attention';
  const message = access.isError ? 'Nothing was added. Please try again.'
    : paymentSoon ? 'The payment gateway will appear here to unlock your second company.'
      : 'Active access is required before adding a company. You can review your access on the billing page.';

  return (
    <Sheet open title={title} onClose={close} footer={
      <>
        {access.isError ? (
          <Button variant="primary" onClick={() => { void access.refetch(); }}>Try again</Button>
        ) : !paymentSoon ? (
          <a className="button button--primary button--md" href="/billing">Review access</a>
        ) : null}
        <Button onClick={close}>{onClose === undefined ? 'Back to my companies' : 'Back to my company'}</Button>
      </>
    }>
      <p>{message}</p>
      {paymentSoon ? <p>Your existing company stays available. Trio and Enterprise open soon.</p> : null}
    </Sheet>
  );
}
