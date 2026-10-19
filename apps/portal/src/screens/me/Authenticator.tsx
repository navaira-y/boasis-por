import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AuthenticatorCode,
  MFA_RECOVERY_COPY,
  type AuthenticatorEnrollment,
  type MfaOperation,
} from '@boasis/schema';
import { requestMfa, reloadSecurity } from '../../lib/mfa-client';
import { useSession } from '../../lib/session';

export function Authenticator() {
  const session = useSession();
  const client = useQueryClient();
  const key = ['authenticator', session?.email ?? ''];
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const reply = await requestMfa(null);
      if (!reply.ok) throw new Error(reply.error);
      return reply.state;
    },
    enabled: session !== null,
    retry: false,
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
  });
  const [enrollment, setEnrollment] = useState<AuthenticatorEnrollment | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [factorId, setFactorId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const verified = query.data?.factors.filter((factor) => factor.status === 'verified') ?? [];
  const proofFactor = verified.some((factor) => factor.id === factorId)
    ? factorId
    : (verified[0]?.id ?? '');
  const run = async (operation: MfaOperation) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    const result = await requestMfa(operation);
    locked.current = false;
    setBusy(false);
    setCode('');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    client.setQueryData(key, result.state);
    if (operation.operation === 'enroll') {
      setEnrollment(result.enrollment ?? null);
      setAdding(false);
      return;
    }
    if (operation.operation === 'verify' || operation.operation === 'remove') {
      setEnrollment(null);
      setRemoving(null);
      reloadSecurity();
      return;
    }
    setEnrollment(null);
    void query.refetch();
  };
  const validCode = AuthenticatorCode.safeParse(code).success;
  const proof = { factorId: proofFactor, code };
  const proofFields = (
    <>
      {verified.length > 1 && enrollment === null ? (
        <label className="pwform__field">
          <span>Use a working authenticator</span>
          <select
            value={proofFactor}
            onChange={(event) => {
              setFactorId(event.currentTarget.value);
            }}
            disabled={busy}
          >
            {verified.map((factor) => (
              <option key={factor.id} value={factor.id}>
                {factor.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="pwform__field">
        <span>
          {enrollment === null ? 'Authenticator code' : 'Code from the new authenticator'}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          disabled={busy}
          onChange={(event) => {
            setCode(event.currentTarget.value.replace(/\D/g, '').slice(0, 6));
          }}
        />
      </label>
    </>
  );
  return (
    <section className="abox" aria-labelledby="authenticator-heading">
      <div className="hd">
        <h3 id="authenticator-heading">Two-step verification</h3>
        <p>Use an authenticator app. Setup is only enabled after its code is verified.</p>
      </div>
      {query.isPending ? (
        <p className="arow" role="status">
          Checking authenticator status...
        </p>
      ) : query.isError ? (
        <div className="pwform">
          <p role="alert">Could not check authenticator status. No setting has been assumed.</p>
          <button
            className="g"
            type="button"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          <div className="arow keep">
            <span className="k">Authenticator</span>
            <span className="v" data-testid="mfa-status">
              {query.data.enabled ? 'On, verified' : 'Off'}
            </span>
            {!adding && enrollment === null ? (
              <button
                className="g"
                type="button"
                disabled={busy || query.data.requiresVerification}
                onClick={() => {
                  setAdding(true);
                  setName(query.data.enabled ? 'Backup authenticator' : 'Authenticator');
                  setRemoving(null);
                  setError('');
                }}
              >
                {' '}
                {query.data.enabled ? 'Add backup app' : 'Set up authenticator'}
              </button>
            ) : null}
          </div>
          {query.data.requiresVerification ? (
            <p className="pwform">
              <a href="/mfa">Verify your authenticator to continue</a>
            </p>
          ) : null}
          {query.data.factors.map((factor) => (
            <div className="arow keep" key={factor.id}>
              <span className="k">{factor.name}</span>
              <span className="v">
                {factor.status === 'verified' ? 'Verified' : 'Setup not finished'}
              </span>
              <button
                className="g"
                type="button"
                disabled={busy || enrollment !== null || query.data.requiresVerification}
                onClick={() => {
                  setError('');
                  setCode('');
                  setAdding(false);
                  if (factor.status === 'unverified')
                    void run({ operation: 'cancel', factorId: factor.id });
                  else setRemoving(factor.id);
                }}
              >
                {factor.status === 'verified' ? 'Remove app' : 'Discard setup'}
              </button>
            </div>
          ))}
          {adding ? (
            <form
              className="pwform"
              onSubmit={(event) => {
                event.preventDefault();
                void run({ operation: 'enroll', name, ...(query.data.enabled ? { proof } : {}) });
              }}
            >
              <label className="pwform__field">
                <span>Authenticator name</span>
                <input
                  value={name}
                  maxLength={64}
                  disabled={busy}
                  onChange={(event) => {
                    setName(event.currentTarget.value);
                  }}
                />
              </label>
              {query.data.enabled ? (
                <>
                  <p>First enter a fresh code from an already verified app.</p>
                  {proofFields}
                </>
              ) : null}
              <div className="formfoot">
                <button
                  className="p"
                  type="submit"
                  disabled={busy || name.trim() === '' || (query.data.enabled && !validCode)}
                >
                  {busy ? 'Starting setup...' : 'Show setup QR code'}
                </button>
                <button
                  className="g"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setAdding(false);
                    setCode('');
                    setError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
          {enrollment !== null ? (
            <form
              className="pwform"
              onSubmit={(event) => {
                event.preventDefault();
                void run({ operation: 'verify', factorId: enrollment.factorId, code });
              }}
            >
              <p>
                In Google Authenticator, Microsoft Authenticator, Authy, or another compatible app,
                choose Add account and scan this QR code.
              </p>
              <img
                className="mfa-qr"
                src={enrollment.qrCode}
                alt="Scan this account setup QR code with your authenticator app"
              />
              <details>
                <summary>Cannot scan? Use the manual setup key</summary>
                <p>
                  On the same phone, choose Enter a setup key in your authenticator and select
                  time-based codes.
                </p>
                <code className="mfa-secret" data-testid="mfa-manual-key">
                  {enrollment.secret}
                </code>
              </details>
              <p>
                Keep this key private. Enter the six-digit code shown by the app to finish. Scanning
                alone does not turn protection on.
              </p>
              {proofFields}
              <div className="formfoot">
                <button className="p" type="submit" disabled={busy || !validCode}>
                  {busy ? 'Verifying...' : 'Verify and enable'}
                </button>
                <button
                  className="g"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void run({ operation: 'cancel', factorId: enrollment.factorId });
                  }}
                >
                  Cancel setup
                </button>
              </div>
            </form>
          ) : null}
          {removing !== null ? (
            <form
              className="pwform"
              onSubmit={(event) => {
                event.preventDefault();
                void run({ operation: 'remove', factorId: removing, proof });
              }}
            >
              <p>
                {verified.length === 1
                  ? 'Removing your last authenticator turns off two-step verification. A fresh code is required.'
                  : 'Enter a fresh code from a working verified app to remove the selected authenticator.'}
              </p>
              {proofFields}
              <div className="formfoot">
                <button type="submit" className="p" disabled={busy || !validCode}>
                  {busy ? 'Removing...' : 'Verify and remove'}
                </button>
                <button
                  type="button"
                  className="g"
                  disabled={busy}
                  onClick={() => {
                    setRemoving(null);
                    setCode('');
                    setError('');
                  }}
                >
                  Keep app
                </button>
              </div>
            </form>
          ) : null}
          <p className="pwform">{MFA_RECOVERY_COPY}</p>
        </>
      )}
      {error !== '' ? (
        <p className="pwform ferr" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
