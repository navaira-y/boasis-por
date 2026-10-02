import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { onboarding, screens } from '../copy/en';
import { CreateAccount } from './onboarding/CreateAccount';
import './onboarding/onboarding.css';
import { signIn, useSession } from '../lib/session';
import { IconEye, IconEyeOff, Logo } from './icons';
import './SignIn.css';

const copy = screens.gate;

// One screen, three states, as lite has it: sign in, a new account, a forgotten password. The
// mode is state, not an address, so an installed app keeps one route for the gate.
type Mode = 'signin' | 'signup' | 'forgot';

function Field({
  id,
  label,
  hint,
  ...rest
}: { id: string; label: string; hint?: string } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'id'
>) {
  return (
    <label className="gf" htmlFor={id}>
      <span className="gl">{label}</span>
      <input id={id} {...rest} />
      {hint !== undefined ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  confirm,
  onConfirm,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  confirm?: string;
  onConfirm?: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const mismatch = confirm !== undefined && confirm.length > 0 && confirm !== value;
  return (
    <>
      <label className="gf" htmlFor={id}>
        <span className="gl">{label}</span>
        <span className="pw">
          <input
            id={id}
            type={visible ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete={autoComplete}
            value={value}
            onChange={(event) => {
              onChange(event.currentTarget.value);
            }}
          />
          <button
            type="button"
            className="eye"
            onClick={() => {
              setVisible(!visible);
            }}
            aria-label={visible ? copy.hidePassword : copy.showPassword}
            aria-pressed={visible}
          >
            {visible ? <IconEyeOff size={17} /> : <IconEye size={17} />}
          </button>
        </span>
      </label>
      {confirm !== undefined ? (
        <label className="gf" htmlFor={`${id}-again`}>
          <span className="gl">{copy.again}</span>
          <span className="pw">
            <input
              id={`${id}-again`}
              type={visible ? 'text' : 'password'}
              required
              autoComplete="new-password"
              value={confirm}
              className={mismatch ? 'bad' : ''}
              onChange={(event) => {
                onConfirm?.(event.currentTarget.value);
              }}
            />
          </span>
          {mismatch ? <span className="hint bad">{copy.mismatch}</span> : null}
        </label>
      ) : null}
    </>
  );
}

const TEXT: Record<Mode, { step: string; title: string; sub: string; cta: string }> = {
  signin: {
    step: copy.stepSignin,
    title: copy.titleSignin,
    sub: copy.subSignin,
    cta: copy.ctaSignin,
  },
  signup: {
    step: copy.stepSignup,
    title: copy.titleSignup,
    sub: copy.subSignup,
    cta: copy.ctaSignup,
  },
  forgot: {
    step: copy.stepForgot,
    title: copy.titleForgot,
    sub: copy.subForgot,
    cta: copy.ctaForgot,
  },
};

// Screen 1 (spec 14): lite's gate, ported. Any email and password signs in against the mock;
// the session lives in storage (rule 12).
export function SignIn() {
  const session = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  if (session !== null) {
    return <Navigate to="/" replace />;
  }

  // The new account form is step 0 of onboarding (CreateAccount); this form signs in or resets.
  const ready = email.trim() !== '' && (mode === 'forgot' || password.length >= 8);

  const go = (next: Mode) => {
    setMode(next);
    setSent(false);
    setPassword('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !ready) {
      return;
    }
    setBusy(true);
    if (mode === 'forgot') {
      setSent(true);
      setBusy(false);
      return;
    }
    signIn(email);
    setBusy(false);
    void navigate('/', { replace: true });
  };

  const text = TEXT[mode];

  return (
    <div className="gate">
      <div className="scene">
        <div className="wordmark">
          <Logo size={30} className="orb" />
          <div>
            <div className="n">{copy.brand}</div>
            <div className="s">{copy.brandSub}</div>
          </div>
        </div>

        <div className="say">
          <h2 className="claim">
            {copy.claimLead} <b>{copy.claimAccent}</b>.
          </h2>
          <p className="said">{copy.said}</p>
        </div>

        <div className="base">
          <div className="proof">
            {copy.proofs.map(([title, body], index) => (
              <div key={title}>
                <span className="i">{`0${String(index + 1)}`}</span>
                <span className="t">
                  <b>{title}</b> {body}
                </span>
              </div>
            ))}
          </div>
          <p className="legal">{copy.legal}</p>
        </div>
      </div>

      <div className="entry">
        <div className="frm">
          <div className="step">{text.step}</div>
          <h1>{mode === 'signup' ? onboarding.account.title : text.title}</h1>
          {mode === 'signup' ? null : <p className="sub">{text.sub}</p>}

          {mode === 'signup' ? (
            <CreateAccount />
          ) : sent ? (
            <>
              <div className="sent">{copy.sent(email)}</div>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  go('signin');
                }}
              >
                {copy.back}
              </button>
            </>
          ) : (
            <form onSubmit={submit} noValidate>
              <Field
                id="email"
                label={copy.email}
                type="email"
                autoComplete="email"
                required
                inputMode="email"
                value={email}
                placeholder={copy.emailPlaceholder}
                onChange={(event) => {
                  setEmail(event.currentTarget.value);
                }}
              />

              {mode !== 'forgot' ? (
                <PasswordField
                  id="password"
                  label={copy.password}
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                />
              ) : null}

              <button className="primary" type="submit" disabled={busy || !ready}>
                {busy ? copy.busy : text.cta}
              </button>
            </form>
          )}

          {!sent && mode === 'signin' ? (
            <div className="alt">
              <button
                type="button"
                onClick={() => {
                  go('forgot');
                }}
              >
                {copy.forgot}
              </button>
              <span>
                {copy.noAccount}{' '}
                <button
                  type="button"
                  onClick={() => {
                    go('signup');
                  }}
                >
                  {copy.createOne}
                </button>
              </span>
            </div>
          ) : null}
          {!sent && mode === 'signup' ? (
            <div className="alt">
              <span>
                {copy.haveAccount}{' '}
                <button
                  type="button"
                  onClick={() => {
                    go('signin');
                  }}
                >
                  {copy.signIn}
                </button>
              </span>
            </div>
          ) : null}
          {!sent && mode === 'forgot' ? (
            <div className="alt">
              <button
                type="button"
                onClick={() => {
                  go('signin');
                }}
              >
                {copy.back}
              </button>
            </div>
          ) : null}

          <div className="lang">
            <button type="button" lang="en" className="on" aria-pressed>
              {copy.language}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
