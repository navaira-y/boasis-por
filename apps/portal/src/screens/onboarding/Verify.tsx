import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { useAccount, useOnboardingRefresh } from '../../data/onboarding';
import { useRepos } from '../../data/ReposProvider';
import { ADD_COMPANY_PATH } from '../../lib/onboarding/steps';
import './onboarding.css';

// Onboarding v2 step 0: the email is verified by a link before step 1 opens. The mock has no
// email, so a "Verify now" button stands in for the link; a backend replaces it with the link.
export function Verify() {
  const repos = useRepos();
  const refresh = useOnboardingRefresh();
  const navigate = useNavigate();
  const account = useAccount();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (account.isPending) {
    return (
      <p className="status" role="status">
        {copy.common.loading}
      </p>
    );
  }
  const record = account.data ?? null;
  if (record === null) {
    return <Navigate to="/" replace />;
  }
  if (record.emailVerifiedOn !== null) {
    return <Navigate to={ADD_COMPANY_PATH} replace />;
  }
  return (
    <div className="pg ob ob--narrow">
      <h1 className="ob__title">{copy.verify.title}</h1>
      <p className="ob__why">{copy.verify.body(record.email)}</p>
      <div className="ob__actions">
        <button
          type="button"
          className="ob-btn ob-btn--primary"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void repos.auth
              .verifyEmail(record.id)
              .then(refresh)
              .then(() => navigate(ADD_COMPANY_PATH, { replace: true }));
          }}
        >
          {copy.verify.demo}
        </button>
        <button
          type="button"
          className="ob-btn"
          disabled={busy}
          onClick={() => {
            void repos.auth.resendVerification(record.id).then(() => {
              setNote(copy.verify.resent);
            });
          }}
        >
          {copy.verify.resend}
        </button>
      </div>
      <p className="ob-why">{copy.verify.demoNote}</p>
      <p className="ob-why" role="status">
        {note}
      </p>
    </div>
  );
}
