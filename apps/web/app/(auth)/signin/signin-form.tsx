'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { isValidEmail, normalizeEmail } from '@/lib/email';
import { CTA, SIGNIN_COPY } from '@/lib/copy';
import { sendCodeAction } from '../signup/actions';
import { signInAction, verifySignInCodeAction } from './actions';

/**
 * Two ways in for a returning visitor, and no dead end for a forgotten
 * password: a code to the inbox signs you in just as well, using the
 * machinery the entry flow already runs.
 */
export function SignInForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cleanEmail = normalizeEmail(email);
  const canSubmit = isValidEmail(cleanEmail);

  function go(next: string | undefined) {
    router.push(next ?? '/portal');
  }

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const result = await signInAction(cleanEmail, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not sign you in. Please try again.');
      return;
    }
    go(result.next);
  }

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const result = await sendCodeAction(cleanEmail);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not send the code. Please try again.');
      return;
    }
    setCodeSent(true);
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    const result = await verifySignInCodeAction(cleanEmail, code);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'That code is not right.');
      return;
    }
    go(result.next);
  }

  return (
    <div>
      {error !== null && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {mode === 'password' ? (
        <form
          onSubmit={(event) => {
            void submitPassword(event);
          }}
          noValidate
        >
          <p className="eyebrow">Boasis portal</p>
          <h1>{SIGNIN_COPY.title}</h1>
          <p className="lede">{SIGNIN_COPY.lede}</p>
          <div className="field">
            <label htmlFor="signin-email">Email</label>
            <input
              id="signin-email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(event) => { setEmail(event.target.value); }}
              placeholder="you@company.com"
            />
          </div>
          <div className="field">
            <label htmlFor="signin-password">Password</label>
            <input
              id="signin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => { setPassword(event.target.value); }}
            />
          </div>
          <button className="btn" type="submit" disabled={!canSubmit || busy || password.length === 0}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="hint" style={{ marginBlockStart: 14 }}>
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setMode('code');
                setError(null);
              }}
            >
              {SIGNIN_COPY.forgot}
            </button>
          </p>
        </form>
      ) : (
        <form
          onSubmit={(event) => {
            void (codeSent ? submitCode(event) : sendCode(event));
          }}
          noValidate
        >
          <p className="eyebrow">Boasis portal</p>
          <h1>Sign in with a code</h1>
          <p className="lede">
            {codeSent
              ? `Enter the code we sent to ${cleanEmail}.`
              : 'We will send a code to your inbox. No password needed.'}
          </p>
          <div className="field">
            <label htmlFor="code-email">Email</label>
            <input
              id="code-email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus={!codeSent}
              value={email}
              onChange={(event) => { setEmail(event.target.value); }}
              disabled={codeSent}
              placeholder="you@company.com"
            />
          </div>
          {codeSent && (
            <div className="field">
              <label htmlFor="code-value">Six-digit code</label>
              <input
                id="code-value"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => { setCode(event.target.value.replace(/\D/g, '').slice(0, 6)); }}
                style={{ letterSpacing: '0.25em', fontSize: 20 }}
              />
            </div>
          )}
          <button
            className="btn"
            type="submit"
            disabled={!canSubmit || busy || (codeSent && code.length !== 6)}
          >
            {busy ? CTA.sending : codeSent ? 'Sign in' : 'Email me a code'}
          </button>
          <p className="hint" style={{ marginBlockStart: 14 }}>
            <button
              type="button"
              className="linkish"
              onClick={() => {
                setMode('password');
                setCodeSent(false);
                setError(null);
              }}
            >
              Use my password instead
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
