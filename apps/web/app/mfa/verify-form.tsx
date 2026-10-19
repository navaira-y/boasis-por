'use client';

import { useRef, useState } from 'react';
import { MfaReply, type MfaState } from '@boasis/schema';

export function MfaChallenge({ state }: { state: MfaState }) {
  const factors = state.factors.filter((factor) => factor.status === 'verified');
  const [factorId, setFactorId] = useState(factors[0]?.id ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  if (factors.length === 0)
    return (
      <p role="alert">
        No supported authenticator is available. Contact support; email alone cannot bypass this
        check.
      </p>
    );
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current || !/^\d{6}$/.test(code)) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/security/mfa', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'verify', factorId, code }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload: unknown = await response.json();
      const result = MfaReply.parse(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.state.requiresVerification) {
        setError('Verification has not been confirmed. Try a new code.');
        return;
      }
      // A full navigation reads the new provider-issued session cookie, rather
      // than reusing private-page data fetched under the first-factor session.
      window.location.assign('/signin');
    } catch {
      setError('Could not confirm verification. Reload and check before trying again.');
    } finally {
      locked.current = false;
      setBusy(false);
      setCode('');
    }
  };
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
    >
      <p className="lede">Enter the code from your authenticator app to finish signing in.</p>
      {factors.length > 1 ? (
        <div className="field">
          <label htmlFor="mfa-factor">Authenticator</label>
          <select
            id="mfa-factor"
            value={factorId}
            disabled={busy}
            onChange={(event) => {
              setFactorId(event.currentTarget.value);
            }}
          >
            {factors.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="authenticator-code">Authenticator code</label>
        <input
          id="authenticator-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          autoFocus
          value={code}
          disabled={busy}
          onChange={(event) => {
            setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6));
          }}
        />
      </div>
      {error !== '' ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button className="btn" type="submit" disabled={busy || !/^\d{6}$/.test(code)}>
        {busy ? 'Verifying...' : 'Verify and continue'}
      </button>
      <p className="hint">
        No code? Use another verified authenticator if you added one. Signing in with email again
        does not remove this check.
      </p>
    </form>
  );
}
