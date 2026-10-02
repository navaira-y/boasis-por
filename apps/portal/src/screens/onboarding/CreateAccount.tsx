import { Plan } from '@boasis/schema';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { useOnboardingRefresh } from '../../data/onboarding';
import { useRepos } from '../../data/ReposProvider';
import { isEmail } from '../../lib/onboarding/people';
import { PLANS, TERMS_VERSION } from '../../lib/plan';
import { formatLong } from '../../lib/format';
import { signIn } from '../../lib/session';

// Onboarding v2 step 0: the account comes first. Full name, email, a password of at least 12
// characters checked against leaked-password lists, two-step sign-in offered, the plan, and the
// terms tick with its version. The email is verified by a link before step 1 opens.

export const PASSWORD_MIN = 12;

export interface AccountErrors {
  fullName?: string;
  email?: string;
  password?: string;
  terms?: string;
}

export function accountErrors(input: {
  fullName: string;
  email: string;
  password: string;
  terms: boolean;
}): AccountErrors {
  const errors: AccountErrors = {};
  const name = input.fullName.trim();
  if (name.length < 2 || name.length > 100) {
    errors.fullName = copy.account.fullNameError;
  }
  if (!isEmail(input.email)) {
    errors.email = copy.account.emailError;
  }
  if (input.password.length < PASSWORD_MIN) {
    errors.password = copy.account.passwordShort;
  }
  if (!input.terms) {
    errors.terms = copy.account.termsError;
  }
  return errors;
}

export function splitName(fullName: string): { firstName: string; lastName: string } {
  const [first = '', ...rest] = fullName.trim().split(/\s+/);
  return { firstName: first, lastName: rest.join(' ') };
}

export function CreateAccount() {
  const repos = useRepos();
  const refresh = useOnboardingRefresh();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoStep, setTwoStep] = useState(false);
  const [plan, setPlan] = useState<Plan>('one-company');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<AccountErrors>({});
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) {
      return;
    }
    const found = accountErrors({ fullName, email, password, terms });
    setErrors(found);
    setFailure('');
    if (Object.keys(found).length > 0) {
      return;
    }
    setBusy(true);
    try {
      const breach = await repos.passwords.check(password);
      if (breach !== 'ok') {
        setErrors({
          password:
            breach === 'breached' ? copy.account.passwordBreached : copy.account.passwordUnchecked,
        });
        setBusy(false);
        return;
      }
      const account = await repos.auth.signUp({
        fullName,
        email,
        password,
        plan,
        termsVersion: TERMS_VERSION,
        twoStepOn: twoStep,
      });
      signIn(account.email, splitName(account.fullName));
      await refresh();
      void navigate('/verify', { replace: true });
    } catch (error: unknown) {
      setFailure(error instanceof Error ? error.message : copy.common.error);
      setBusy(false);
    }
  };

  const hint = (id: string, why: string, error: string | undefined) => (
    <>
      <span className="hint" id={`${id}-why`}>
        {why}
      </span>
      {error !== undefined ? (
        <span className="hint bad" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </>
  );
  const described = (id: string, error: string | undefined) =>
    error === undefined ? `${id}-why` : `${id}-why ${id}-error`;

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="acct">
      <p className="sub">{copy.account.why}</p>
      <div className="gf">
        <label className="gl" htmlFor="acct-name">
          {copy.account.fullName}
        </label>
        <input
          id="acct-name"
          type="text"
          autoComplete="name"
          value={fullName}
          className={errors.fullName !== undefined ? 'bad' : ''}
          aria-invalid={errors.fullName !== undefined || undefined}
          aria-describedby={described('acct-name', errors.fullName)}
          onChange={(event) => {
            setFullName(event.currentTarget.value);
          }}
        />
        {hint('acct-name', copy.account.fullNameWhy, errors.fullName)}
      </div>
      <div className="gf">
        <label className="gl" htmlFor="acct-email">
          {copy.account.email}
        </label>
        <input
          id="acct-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          className={errors.email !== undefined ? 'bad' : ''}
          aria-invalid={errors.email !== undefined || undefined}
          aria-describedby={described('acct-email', errors.email)}
          onChange={(event) => {
            setEmail(event.currentTarget.value);
          }}
        />
        {hint('acct-email', copy.account.emailWhy, errors.email)}
      </div>
      <div className="gf">
        <label className="gl" htmlFor="acct-password">
          {copy.account.password}
        </label>
        <input
          id="acct-password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          value={password}
          className={errors.password !== undefined ? 'bad' : ''}
          aria-invalid={errors.password !== undefined || undefined}
          aria-describedby={described('acct-password', errors.password)}
          onChange={(event) => {
            setPassword(event.currentTarget.value);
          }}
        />
        {hint('acct-password', copy.account.passwordWhy, errors.password)}
      </div>
      <fieldset className="gf acct__set">
        <legend className="gl">{copy.account.plan}</legend>
        {Plan.options.map((option) => (
          <label key={option} className="acct__radio">
            <input
              type="radio"
              name="acct-plan"
              value={option}
              aria-label={copy.account.planOption(PLANS[option].companies, PLANS[option].priceAed)}
              checked={plan === option}
              onChange={() => {
                setPlan(option);
              }}
            />
            <span>{copy.account.planOption(PLANS[option].companies, PLANS[option].priceAed)}</span>
          </label>
        ))}
        <span className="hint">{copy.account.planWhy}</span>
      </fieldset>
      <div className="gf">
        <label className="acct__radio">
          <input
            type="checkbox"
            aria-label={copy.account.twoStep}
            checked={twoStep}
            aria-describedby="acct-two-why"
            onChange={(event) => {
              setTwoStep(event.currentTarget.checked);
            }}
          />
          <span>{copy.account.twoStep}</span>
        </label>
        <span className="hint" id="acct-two-why">
          {copy.account.twoStepWhy}
        </span>
      </div>
      <div className="gf">
        <label className="acct__radio">
          <input
            type="checkbox"
            aria-label={copy.account.terms}
            checked={terms}
            aria-invalid={errors.terms !== undefined || undefined}
            aria-describedby={described('acct-terms', errors.terms)}
            onChange={(event) => {
              setTerms(event.currentTarget.checked);
            }}
          />
          <span>{copy.account.terms}</span>
        </label>
        {hint('acct-terms', copy.account.termsVersion(formatLong(TERMS_VERSION)), errors.terms)}
      </div>
      {failure !== '' ? (
        <p className="hint bad" role="alert">
          {failure}
        </p>
      ) : null}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? copy.common.saving : copy.account.create}
      </button>
    </form>
  );
}
