'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isValidEmail, normalizeEmail, suggestEmailFix } from '@/lib/email';
import { CTA, ENTRY_COPY, TERMS_VERSION } from '@/lib/copy';
import { formatAED, type Plan, type PlanId } from '@/lib/plans';
import { checkEntryAction, completeEntryAction, recordPlanWishAction, sendCodeAction, verifyCodeAction } from './actions';
import type { EntryCheckResponse } from './actions';

/**
 * The entry flow as one screen that changes its mind, never as a page reload:
 *   email -> door (waitlist | plans) -> password + terms -> code -> portal
 *
 * Two deliberate details that keep password managers working: the password
 * input is uncontrolled and lives in a ref (no re-render while it is being
 * typed or filled), and a hidden, stable username field carries the email, so
 * Chrome pairs a generated password with the right account instead of
 * revoking the fill every time the name field above changes.
 */

type Phase = 'email' | 'door' | 'password' | 'code' | 'finishing';
type Branch = 'waitlist' | 'plans';

const STEPS: { id: Phase; label: string }[] = [
  { id: 'email', label: 'Email' },
  { id: 'door', label: 'Plan' },
  { id: 'password', label: 'Password' },
  { id: 'code', label: 'Code' },
];

function stepState(current: Phase, step: Phase): 'done' | 'now' | 'todo' {
  const order: Phase[] = ['email', 'door', 'password', 'code', 'finishing'];
  const index = (phase: Phase) => order.indexOf(phase === 'finishing' ? 'code' : phase);
  const stepIndex = index(step);
  const currentIndex = index(current);
  if (stepIndex < currentIndex) return 'done';
  if (stepIndex === currentIndex) return 'now';
  return 'todo';
}

export function EntryForm({
  plans,
  resumeEmail,
  notice = null,
  limitedSender = false,
}: {
  plans: Plan[];
  resumeEmail: string | null;
  /** Something the server wants the visitor told before they type anything. */
  notice?: string | null;
  /** True while email goes out through a sender that allows about two an hour. */
  limitedSender?: boolean;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>(resumeEmail === null ? 'email' : 'password');
  const [branch, setBranch] = useState<Branch | null>(null);
  const [email, setEmail] = useState(resumeEmail ?? '');
  const [emailTouched, setEmailTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);
  const [problem, setProblem] = useState<EntryCheckResponse['problem'] | null>(null);
  const [ackedProblem, setAckedProblem] = useState(false);
  const [selected, setSelected] = useState<PlanId>('solo');
  const [wish, setWish] = useState<PlanId | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const [verifyPending, setVerifyPending] = useState(false);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);

  // Typed values that must survive a re-render: kept in a ref, never state.
  const stash = useRef({ name: '', password: '' });
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  const cleanEmail = normalizeEmail(email);
  const emailLooksRight = isValidEmail(cleanEmail);
  const typoHint = emailLooksRight ? suggestEmailFix(cleanEmail) : null;
  const code = digits.join('');

  // Resend ticker: only ever runs on the code step.
  useEffect(() => {
    if (phase !== 'code' || cooldown <= 0) return;
    const timer = setTimeout(() => { setCooldown((value) => value - 1); }, 1000);
    return () => { clearTimeout(timer); };
  }, [phase, cooldown]);

  useEffect(() => {
    if (phase === 'code') boxRefs.current[0]?.focus();
  }, [phase]);

  function reset() {
    setPhase('email');
    setBranch(null);
    setProblem(null);
    setAckedProblem(false);
    setError(null);
    setDigits(['', '', '', '', '', '']);
    setCodeSent(false);
  }

  async function onEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!emailLooksRight || busy) return;
    setBusy(true);
    setError(null);
    const result = await checkEntryAction(cleanEmail);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not check that address. Please try again.');
      return;
    }
    setBranch(result.branch ?? 'plans');
    setProblem(result.problem ?? null);
    setSelected('solo');
    setPhase('door');
  }

  async function onPasswordSubmit(event: React.FormEvent) {
    event.preventDefault();
    const name = nameRef.current?.value.trim() ?? '';
    const password = passwordRef.current?.value ?? '';
    if (name.length < 2) {
      setError('Please enter your account name.');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (termsRef.current?.checked !== true) {
      setError('Please accept the Terms and Privacy Policy to continue.');
      return;
    }
    stash.current = { name, password };
    setBusy(true);
    setError(null);

    if (resumeEmail !== null) {
      await finish();
      return;
    }
    const sent = await sendCodeAction(cleanEmail);
    setBusy(false);
    if (!sent.ok) {
      setError(sent.error ?? 'Could not send the code. Please try again.');
      return;
    }
    setDigits(['', '', '', '', '', '']);
    setCodeSent(true);
    setCooldown(60);
    setPhase('code');
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const sent = await sendCodeAction(cleanEmail);
    setBusy(false);
    if (!sent.ok) {
      setError(sent.error ?? 'Could not send the code. Please try again.');
      return;
    }
    setDigits(['', '', '', '', '', '']);
    setCooldown(60);
    boxRefs.current[0]?.focus();
  }

  async function finish() {
    setPhase('finishing');
    setError(null);
    const result = await completeEntryAction({
      fullName: stash.current.name,
      password: stash.current.password,
      acceptedTerms: true,
      wish,
    });
    // Success redirects on the server and never returns here.
    setBusy(false);
    setVerifyPending(false);
    setError(result.error ?? 'Could not create your account. Please try again.');
    setPhase(resumeEmail === null ? 'code' : 'password');
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;

  async function verifyNow() {
    if (code.length !== 6 || verifyPending) return;
    setVerifyPending(true);
    setError(null);
    const result = await verifyCodeAction(cleanEmail, code);
    if (!result.ok) {
      setVerifyPending(false);
      setError(result.error ?? 'That code is not right. Please try again.');
      setDigits(['', '', '', '', '', '']);
      boxRefs.current[0]?.focus();
      return;
    }
    // The code is good and the inbox is proven. If a name and password are
    // already typed, finish without another round trip; otherwise (someone who
    // came back through the email link) ask for them here.
    if (result.next === '/signup' && stash.current.password.length >= 12) {
      await finishRef.current();
      return;
    }
    setVerifyPending(false);
    setPhase('password');
  }
  const verifyRef = useRef(verifyNow);
  verifyRef.current = verifyNow;

  useEffect(() => {
    if (phase === 'code' && code.length === 6) void verifyRef.current();
  }, [phase, code]);

  function onDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((previous) => {
      const next = [...previous];
      next[index] = digit;
      return next;
    });
    if (digit.length > 0 && index < 5) boxRefs.current[index + 1]?.focus();
  }

  function onDigitKey(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && digits[index] === '' && index > 0) {
      boxRefs.current[index - 1]?.focus();
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 0) return;
    event.preventDefault();
    setDigits([0, 1, 2, 3, 4, 5].map((index) => pasted[index] ?? ''));
    boxRefs.current[Math.min(pasted.length, 5)]?.focus();
  }

  function choosePlan(plan: Plan) {
    if (plan.live) {
      setSelected(plan.id);
      setWish(null);
      return;
    }
    setSelected('solo');
    setWish(plan.id);
    void recordPlanWishAction(cleanEmail, plan.id);
  }

  return (
    <div>
      <ol className="steps" aria-label="Progress">
        {STEPS.map((step) => (
          <li key={step.id} data-state={stepState(phase, step.id)}>
            <span className="screenreader">{step.label}</span>
          </li>
        ))}
      </ol>

      {error !== null && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {phase === 'email' && (
        <form
          onSubmit={(event) => {
            void onEmailSubmit(event);
          }}
          noValidate
        >
          <p className="eyebrow">Boasis portal</p>
          <h1>Start your company file</h1>
          <p className="lede">
            One place for your licence, your people and every date that matters. It takes an email
            to begin.
          </p>
          <div className="field">
            <label htmlFor="email">{ENTRY_COPY.emailLabel}</label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              placeholder="you@company.com"
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailTouched(true);
              }}
              onBlur={() => { setEmailTouched(true); }}
            />
            {emailTouched && email.length > 0 && !emailLooksRight && (
              <p className="hint hint-warn">That does not look like an email address yet.</p>
            )}
            {typoHint !== null && (
              <p className="hint">
                Did you mean{' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => { setEmail(typoHint); }}
                >
                  {typoHint}
                </button>
                ?
              </p>
            )}
            <p className="why">{ENTRY_COPY.emailWhy}</p>
          </div>
          <button className="btn" type="submit" disabled={!emailLooksRight || busy}>
            {busy ? CTA.checking : CTA.continue}
          </button>
        </form>
      )}

      {phase === 'door' && (
        <div>
          {problem != null && !ackedProblem && (
            <div className="error" role="alert">
              <strong>One thing needs fixing in our setup</strong>
              {problem.title}
              <p className="small" style={{ marginBlock: '8px 6px' }}>
                {problem.fix}
              </p>
              <p className="small" style={{ marginBlock: 0 }}>
                Reference <code>{problem.code}</code>
              </p>
              {problem.continueAllowed && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  style={{ marginBlockStart: 12 }}
                  onClick={() => { setAckedProblem(true); }}
                >
                  Continue anyway
                </button>
              )}
            </div>
          )}

          {branch === 'waitlist' && (
            <>
              <h1>{ENTRY_COPY.waitlistTitle}</h1>
              <div className="notice">{ENTRY_COPY.waitlistBody}</div>
              <button className="btn" type="button" onClick={() => { setPhase('password'); }}>
                {CTA.waitlistContinue}
              </button>
            </>
          )}

          {branch === 'plans' && (
            <>
              <h1>{ENTRY_COPY.plansTitle}</h1>
              <p className="lede">{ENTRY_COPY.plansLede}</p>
              <div className="plans" role="radiogroup" aria-label="Choose a plan">
                {plans.map((plan) => {
                  const isLive = plan.live;
                  const isSelected = isLive && selected === plan.id;
                  const price =
                    plan.priceFils === null
                      ? 'Custom'
                      : formatAED(plan.priceFils, plan.currency);
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      className={`plan ${isLive ? 'is-live' : 'is-soon'}`}
                      onClick={() => { choosePlan(plan); }}
                    >
                      <h3>{plan.name}</h3>
                      <div className="price">
                        {price}
                        {plan.priceFils !== null && <span className="muted small"> /month</span>}
                      </div>
                      <p className="small muted" style={{ margin: 0 }}>
                        {plan.maxCompanies === null
                          ? 'Unlimited companies'
                          : plan.maxCompanies === 1
                            ? '1 company'
                            : `Up to ${String(plan.maxCompanies)} companies`}
                      </p>
                      <span className={`pill ${isLive ? 'live' : ''}`}>
                        {isLive ? 'Available now' : 'Opens soon'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {wish !== null ? (
                <p className="hint">
                  Noted, we will email you the moment <strong>{wish}</strong> opens. Your access
                  stays Solo for now.
                </p>
              ) : (
                <p className="hint">{ENTRY_COPY.soloFreeLine}</p>
              )}
              <button
                className="btn"
                type="button"
                style={{ marginBlockStart: 12 }}
                onClick={() => { setPhase('password'); }}
                disabled={selected !== 'solo'}
              >
                {CTA.plansContinue}
              </button>
            </>
          )}

          <p className="hint" style={{ marginBlockStart: 14 }}>
            Wrong address?{' '}
            <button type="button" className="linkish" onClick={reset}>
              {CTA.useDifferentEmail}
            </button>
          </p>
        </div>
      )}
      {phase === 'password' && (
        <form
          onSubmit={(event) => {
            void onPasswordSubmit(event);
          }}
          noValidate
        >
          <h1>{ENTRY_COPY.passwordTitle}</h1>
          <p className="lede">
            Two fields and a tick, then a six-digit code to your inbox.
          </p>
          {resumeEmail !== null && (
            <div className="notice">
              Email verified: <strong>{cleanEmail}</strong>
            </div>
          )}
          <div className="field">
            <label htmlFor="fullName">Account name</label>
            <input
              id="fullName"
              ref={nameRef}
              name="fullName"
              type="text"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              defaultValue=""
              placeholder="e.g. Navaira Yousaf"
            />
            <p className="why">This is how your portal greets you, and how support finds you.</p>
          </div>
          {/* Stable username for password managers: the email never changes, so
              a generated password stays paired with this account. */}
          <input
            type="email"
            name="username"
            value={cleanEmail}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="username"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              opacity: 0,
              pointerEvents: 'none',
            }}
          />
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              ref={passwordRef}
              name="new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
            <p className="why">
              At least 12 characters. Passwords found in known data leaks are refused.
            </p>
          </div>
          <label className="check">
            <input ref={termsRef} type="checkbox" name="terms" value="yes" />
            <span className="small">
              I accept the Terms and Privacy Policy (version {TERMS_VERSION}).
            </span>
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy
              ? resumeEmail === null
                ? CTA.sendingCode
                : 'Creating your account…'
              : CTA.createAccount}
          </button>
          <p className="hint" style={{ marginBlockStart: 14 }}>
            Wrong address?{' '}
            <button type="button" className="linkish" onClick={reset}>
              {CTA.useDifferentEmail}
            </button>
          </p>
        </form>
      )}

      {phase === 'code' && (
        <div>
          <h1>{ENTRY_COPY.codeTitle}</h1>
          <p className="lede">
            We sent an email to <strong>{cleanEmail}</strong> with a six-digit code and a sign-in
            link. Type the code below, or click the link inside the email and you will land back
            here already verified.
          </p>
          <div className="code-boxes" onPaste={onPaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  boxRefs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={1}
                value={digit}
                disabled={verifyPending}
                aria-label={`Digit ${String(index + 1)}`}
                onChange={(event) => { onDigit(index, event.target.value); }}
                onKeyDown={(event) => { onDigitKey(index, event); }}
              />
            ))}
          </div>
          <button
            className="btn"
            type="button"
            style={{ marginBlockStart: 16 }}
            disabled={code.length !== 6 || verifyPending}
            onClick={() => void verifyRef.current()}
          >
            {verifyPending ? CTA.verifying : CTA.verify}
          </button>
          <ol className="steps">
            <li>Open the newest email from Boasis.</li>
            <li>Type the six digits, or click the link inside it.</li>
            <li>Either way you land back here, verified, and set your password next.</li>
          </ol>
          <div style={{ marginBlockStart: 14 }}>
            {cooldown > 0 ? (
              <p className="hint">You can ask for another email in {String(cooldown)}s.</p>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => {
                  void resend();
                }}
                disabled={busy}
              >
                {busy ? CTA.sending : CTA.resend}
              </button>
            )}
            {limitedSender && (
              <p className="hint">
                While our own sender is being connected, this email comes from Boasis own mail
                service, which sends only a couple an hour and can take a minute to arrive. If
                nothing comes, wait a little before asking again.
              </p>
            )}
            {codeSent && (
              <p className="hint">Nothing in your inbox yet? Ask again below, and use the newest email: it is the only one that works.</p>
            )}
            <p className="hint">
              Wrong address?{' '}
              <button type="button" className="linkish" onClick={reset}>
                {CTA.useDifferentEmail}
              </button>
            </p>
          </div>
        </div>
      )}

      {phase === 'finishing' && (
        <div className="notice" role="status">
          Creating your account and starting your free year. One moment…
        </div>
      )}

      {phase === 'email' && (
        <p className="hint" style={{ marginBlockStart: 16 }}>
          Already have an account?{' '}
          <button type="button" className="linkish" onClick={() => { router.push('/signin'); }}>
            Sign in
          </button>
        </p>
      )}
    </div>
  );
}
