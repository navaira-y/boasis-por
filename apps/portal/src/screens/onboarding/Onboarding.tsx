import type {
  AuthorityFile,
  AuthorityIndexEntry,
  CompanyFacts,
  OnboardingStep,
} from '@boasis/schema';
import { useQuery } from '@tanstack/react-query';
import { useCallback, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { listAuthorities } from '../../data/content';
import {
  useAccount,
  useAuthorityFile,
  useOnboardingRefresh,
  useOnboardingWorld,
  type OnboardingWorld,
} from '../../data/onboarding';
import { useRepos } from '../../data/ReposProvider';
import type { OpenItem } from '../../data/types';
import { STEP_ITEMS } from '../../lib/onboarding/needs';
import { ADD_COMPANY_PATH, LICENCE_PATH, STEP_ORDER, stepPath } from '../../lib/onboarding/steps';
import { signOut } from '../../lib/session';
import { today } from '../../lib/today';
import { StepCard } from './StepCard';
import { StepEmployees } from './StepEmployees';
import { StepLicence } from './StepLicence';
import { StepOffice } from './StepOffice';
import { StepPeople } from './StepPeople';
import { StepTax } from './StepTax';
import { StepVat } from './StepVat';
import { StepWhere } from './StepWhere';
import { StepYear } from './StepYear';
import './onboarding.css';

// The onboarding lives in the "existing company" branch of Add a company (rule 11). Step 1 and
// step 2 run before the company exists; every later step runs under the company, so leaving and
// coming back resumes on the step saved last (section B.3).

// The account and everything on it, or a screen that says why onboarding cannot open yet.
function useWorld():
  { kind: 'ready'; world: OnboardingWorld } | { kind: 'waiting'; element: ReactNode } {
  const account = useAccount();
  const world = useOnboardingWorld(account.isPending ? undefined : (account.data ?? null));
  if (account.isPending || (account.data != null && world.isPending)) {
    return {
      kind: 'waiting',
      element: (
        <p className="status" role="status">
          {copy.common.loading}
        </p>
      ),
    };
  }
  const record = account.data ?? null;
  if (record === null) {
    return { kind: 'waiting', element: <NoAccount /> };
  }
  if (record.emailVerifiedOn === null) {
    return { kind: 'waiting', element: <Navigate to="/verify" replace /> };
  }
  const loaded = world.data ?? null;
  if (loaded === null) {
    return { kind: 'waiting', element: null };
  }
  return { kind: 'ready', world: loaded };
}

function NoAccount() {
  const navigate = useNavigate();
  return (
    <div className="pg ob ob--narrow">
      <h1 className="ob__title">{copy.verify.noAccount}</h1>
      <p className="ob__why">{copy.verify.noAccountBody}</p>
      <div className="ob__actions">
        <button
          type="button"
          className="ob-btn ob-btn--primary"
          onClick={() => {
            signOut();
            void navigate('/auth', { replace: true });
          }}
        >
          {copy.verify.signOut}
        </button>
      </div>
    </div>
  );
}

export function useZones() {
  return useQuery({ queryKey: ['onboarding', 'zones'], queryFn: listAuthorities });
}

// Route /add-company/existing: step 1, or back to where the person left off.
export function OnboardingEntry() {
  const state = useWorld();
  if (state.kind === 'waiting') {
    return <>{state.element}</>;
  }
  const { world } = state;
  if (world.start !== null) {
    return <Navigate to={LICENCE_PATH} replace />;
  }
  const unfinished = world.progress.find(
    (entry) => entry.lastStep !== 'your-year' && entry.lastStep !== 'employees',
  );
  if (unfinished !== undefined) {
    return <Navigate to={stepPath(unfinished.companyId, unfinished.lastStep)} replace />;
  }
  return <StepWhere world={world} />;
}

// Route /add-company/existing/licence: step 2 before the company exists.
export function OnboardingLicence() {
  const state = useWorld();
  const zones = useZones();
  const start = state.kind === 'ready' ? state.world.start : null;
  const authority = useAuthorityFile(start?.authority ?? null);
  if (state.kind === 'waiting') {
    return <>{state.element}</>;
  }
  if (start === null) {
    return <Navigate to={ADD_COMPANY_PATH} replace />;
  }
  if (zones.isPending || authority.isPending) {
    return (
      <p className="status" role="status">
        {copy.common.loading}
      </p>
    );
  }
  const entry = zones.data?.find((zone) => zone.id === start.authority);
  return (
    <StepLicence
      world={state.world}
      facts={null}
      authorityId={start.authority}
      authority={authority.data ?? null}
      zone={entry}
    />
  );
}

export interface StepProps {
  readonly world: OnboardingWorld;
  readonly facts: CompanyFacts;
  readonly authority: AuthorityFile | null;
  readonly zone: AuthorityIndexEntry | undefined;
}

// Route /onboarding/:companyId/:step: steps 2 to 9 of a company on the account.
export function OnboardingStepRoute() {
  const { companyId = '', step = '' } = useParams();
  const state = useWorld();
  const zones = useZones();
  const facts =
    state.kind === 'ready'
      ? (state.world.companies.find((company) => company.id === companyId) ?? null)
      : null;
  const authority = useAuthorityFile(facts?.identity.authority ?? null);
  if (state.kind === 'waiting') {
    return <>{state.element}</>;
  }
  if (facts === null) {
    return <Navigate to={ADD_COMPANY_PATH} replace />;
  }
  if (zones.isPending || authority.isPending) {
    return (
      <p className="status" role="status">
        {copy.common.loading}
      </p>
    );
  }
  const props: StepProps = {
    world: state.world,
    facts,
    authority: authority.data ?? null,
    zone: zones.data?.find((zone) => zone.id === facts.identity.authority),
  };
  switch (step as OnboardingStep) {
    case 'company':
      return (
        <StepLicence
          world={props.world}
          facts={facts}
          authorityId={facts.identity.authority}
          authority={props.authority}
          zone={props.zone}
        />
      );
    case 'people':
      return <StepPeople {...props} />;
    case 'office':
      return <StepOffice {...props} />;
    case 'establishment-card':
      return <StepCard {...props} />;
    case 'corporate-tax':
      return <StepTax {...props} />;
    case 'vat':
      return <StepVat {...props} />;
    case 'your-year':
      return <StepYear {...props} />;
    case 'employees':
      return <StepEmployees {...props} />;
    default:
      return <Navigate to={stepPath(companyId, 'people')} replace />;
  }
}

// After a step is saved: its tasks are synced, the progress moves on, everything is read again,
// and the next step opens (unless the caller shows something first).
export function useFinishStep() {
  const repos = useRepos();
  const refresh = useOnboardingRefresh();
  const navigate = useNavigate();
  return useCallback(
    async (
      companyId: string,
      step: OnboardingStep,
      items: readonly OpenItem[],
      next: OnboardingStep,
      go = true,
    ) => {
      const scope = STEP_ITEMS[step] ?? [];
      if (scope.length > 0) {
        await repos.onboarding.syncTasks(companyId, items, scope);
      }
      const current = await repos.onboarding.progress(companyId);
      // Progress only moves forward: going back to fix a step does not lose the place reached.
      const keep =
        current !== null &&
        STEP_ORDER.indexOf(current.lastStep) > STEP_ORDER.indexOf(next) &&
        next !== 'your-year';
      await repos.onboarding.saveProgress({
        companyId,
        lastStep: keep ? current.lastStep : next,
        updatedOn: today(),
      });
      await refresh();
      if (go) {
        void navigate(stepPath(companyId, next));
      }
    },
    [navigate, refresh, repos],
  );
}
