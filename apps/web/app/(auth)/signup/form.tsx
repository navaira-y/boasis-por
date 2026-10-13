"use client";

import { useEffect, useRef, useState } from "react";
import {
  checkEntryAction,
  completeEntryAction,
  sendCodeAction,
  verifyCodeAction,
  type AuthState,
} from "./actions";
import { suggestEmailFix } from "@/lib/email-guess";
import { formatAED, type PlanId } from "@/lib/domain";
import type { Plan } from "@/lib/plans";

const idle: AuthState = { ok: false };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = "email" | "door" | "password" | "code" | "finishing";
type Branch = "waitlist" | "plans";

const linkBtnStyle: React.CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  color: "#5FD3E8",
  cursor: "pointer",
  fontSize: "inherit",
};

function priceLine(p: Plan): { main: string; sub: string } {
  if (p.price_fils === null) return { main: "Custom", sub: "" };
  if (p.free_months > 0) {
    return {
      main: `Free for ${p.free_months} months`,
      sub: ` then ${formatAED(p.price_fils, p.currency)}/month`,
    };
  }
  return { main: formatAED(p.price_fils, p.currency), sub: " /month" };
}

function companiesLine(p: Plan): string {
  if (p.max_companies === null) return "Unlimited companies";
  return p.max_companies === 1 ? "1 company" : `Up to ${p.max_companies} companies`;
}

export function SignupForm({
  plans,
  resumeEmail,
}: {
  plans: Plan[];
  resumeEmail: string | null;
}) {
  const [phase, setPhase] = useState<Phase>("email");
  const [branch, setBranch] = useState<Branch | null>(null);
  const [email, setEmail] = useState(resumeEmail ?? "");
  const [emailTouched, setEmailTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [verifyPending, setVerifyPending] = useState(false);
  const [selected, setSelected] = useState<PlanId | null>("solo");

  // Password stash lives in a ref (NOT state): zero re-renders anywhere near
  // the password field, so manager fills never get wiped.
  const stash = useRef({ name: "", password: "" });
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join("");

  const emailValid = EMAIL_RE.test(email.trim());
  const typoHint = emailValid ? suggestEmailFix(email) : null;

  // Resume: verified session but no profile (abandoned halfway, or clicked
  // the email link instead of typing the code) → derive the door silently
  // and jump to the password step. The code step is skipped: this session is
  // already verified.
  const resumed = useRef(false);
  useEffect(() => {
    if (!resumeEmail || resumed.current) return;
    resumed.current = true;
    setBusy(true);
    checkEntryAction(resumeEmail).then((r) => {
      setBusy(false);
      if (r.ok && r.branch) {
        setBranch(r.branch);
        setPhase("password");
      } else {
        setError("That session expired. Please start over with your email.");
        setPhase("email");
      }
    });
  }, [resumeEmail]);

  // Resend cooldown ticker. Runs ONLY on the code step — zero re-renders
  // while the password is being entered.
  useEffect(() => {
    if (cooldown <= 0 || phase !== "code") return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown, phase]);

  // Focus first box when the code step appears.
  useEffect(() => {
    if (phase === "code") boxRefs.current[0]?.focus();
  }, [phase]);

  async function finish(name: string, password: string) {
    const fd = new FormData();
    fd.set("fullName", name);
    fd.set("password", password);
    fd.set("terms", "on");
    setPhase("finishing");
    setError(null);
    const r = await completeEntryAction(idle, fd);
    // Success redirects to /portal (never returns). Reaching here = error.
    setBusy(false);
    setVerifyPending(false);
    setError(r.error ?? "Could not create the account. Please try again.");
    setPhase(resumeEmail ? "password" : "code");
  }
  const finishRef = useRef(finish);
  finishRef.current = finish;

  async function verifyNow() {
    if (code.length !== 6 || verifyPending) return;
    setVerifyPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("email", email.trim());
    fd.set("code", code);
    const r = await verifyCodeAction(idle, fd);
    if (!r.ok) {
      setVerifyPending(false);
      setError(r.error ?? "That code is not correct or it expired.");
      setDigits(["", "", "", "", "", ""]);
      boxRefs.current[0]?.focus();
      return;
    }
    await finishRef.current(stash.current.name, stash.current.password);
  }
  const verifyRef = useRef(verifyNow);
  verifyRef.current = verifyNow;

  // Auto-check once all 6 digits are in.
  useEffect(() => {
    if (code.length === 6 && phase === "code") verifyRef.current();
  }, [code, phase]);

  async function onEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailValid || busy) return;
    setBusy(true);
    setError(null);
    const r = await checkEntryAction(email.trim());
    setBusy(false);
    if (!r.ok || !r.branch) {
      setError(r.error ?? "Could not check that email. Please try again.");
      return;
    }
    setBranch(r.branch);
    setPhase("door");
  }

  async function onPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = nameRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    const terms = termsRef.current?.checked ?? false;
    if (name.length < 2) {
      setError("Please enter your account name.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (!terms) {
      setError("Please accept the terms to continue.");
      return;
    }
    stash.current = { name, password };
    setBusy(true);
    setError(null);
    if (resumeEmail) {
      await finishRef.current(name, password);
      return;
    }
    const fd = new FormData();
    fd.set("email", email.trim());
    const r = await sendCodeAction(idle, fd);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not send the code. Please try again.");
      return;
    }
    setDigits(["", "", "", "", "", ""]);
    setCooldown(60);
    setPhase("code");
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.set("email", email.trim());
    const r = await sendCodeAction(idle, fd);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Could not send the code. Please try again.");
      return;
    }
    setDigits(["", "", "", "", "", ""]);
    setCooldown(60);
    boxRefs.current[0]?.focus();
  }

  function onDigit(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const nextDigits = [...prev];
      nextDigits[i] = d;
      return nextDigits;
    });
    if (d && i < 5) boxRefs.current[i + 1]?.focus();
  }

  function onDigitKey(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
    }
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    setDigits([0, 1, 2, 3, 4, 5].map((i) => text[i] ?? ""));
    boxRefs.current[Math.min(text.length, 5)]?.focus();
  }

  function useDifferentEmail() {
    setPhase("email");
    setBranch(null);
    setError(null);
    setDigits(["", "", "", "", "", ""]);
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}

      {/* ---------- Email first: routes to the waitlist door or plans door. ---------- */}
      {phase === "email" && (
        <form onSubmit={onEmailSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailTouched(true);
              }}
              onBlur={() => setEmailTouched(true)}
              autoComplete="email"
              placeholder="you@company.com"
            />
            {emailTouched && email.length > 0 && !emailValid && (
              <p className="small" style={{ color: "#F2994A" }}>
                That email format doesn&apos;t look right.
              </p>
            )}
            {typoHint && (
              <p className="small" style={{ marginTop: 8 }}>
                Did you mean{" "}
                <button
                  type="button"
                  onClick={() => setEmail(typoHint)}
                  style={linkBtnStyle}
                >
                  {typoHint}
                </button>
                ?
              </p>
            )}
            <p className="small muted">Sign-in and all reminders go here.</p>
          </div>
          <button className="btn" type="submit" disabled={!emailValid || busy}>
            {busy ? "Checking…" : "Continue"}
          </button>
        </form>
      )}

      {/* ---------- Waitlist door: early-access email, no plan choice. ---------- */}
      {phase === "door" && branch === "waitlist" && (
        <div>
          <div className="notice">
            <strong>🎉 You joined the waitlist.</strong>
            <br />
            Early access is yours — set a password and walk straight into your
            portal. No payment, no card.
          </div>
          <button
            className="btn"
            type="button"
            onClick={() => setPhase("password")}
            style={{ marginTop: 12 }}
          >
            Continue →
          </button>
          <p className="small" style={{ marginTop: 12 }}>
            Wrong email?{" "}
            <button type="button" onClick={useDifferentEmail} style={linkBtnStyle}>
              Use a different one
            </button>
          </p>
        </div>
      )}

      {/* ---------- Plans door: welcome + Solo live, rest opening soon. ---------- */}
      {phase === "door" && branch === "plans" && (
        <div>
          <h2 style={{ marginTop: 0 }}>Welcome to Boasis 👋</h2>
          <p className="muted">Three plans. One choice to make:</p>
          {plans.length === 0 ? (
            <div className="error">
              Could not load the plans. Please reload and try again.
            </div>
          ) : (
            <>
              <div className="plans three" role="radiogroup" aria-label="Choose a plan">
                {plans.map((p) => {
                  const price = priceLine(p);
                  if (p.id !== "solo") {
                    return (
                      <div
                        key={p.id}
                        className="plan"
                        aria-disabled="true"
                        style={{ opacity: 0.55, cursor: "not-allowed" }}
                      >
                        <h3>{p.name}</h3>
                        <div className="price">
                          {price.main}
                          <span className="muted small">{price.sub}</span>
                        </div>
                        <p className="muted small">{companiesLine(p)}</p>
                        <p className="small muted">Opens soon</p>
                      </div>
                    );
                  }
                  const isSelected = selected === "solo";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelected("solo")}
                      className={`plan ${isSelected ? "selected" : ""}`}
                    >
                      <h3>{p.name}</h3>
                      <div className="price">
                        {price.main}
                        <span className="muted small">{price.sub}</span>
                      </div>
                      <p className="muted small">{companiesLine(p)}</p>
                    </button>
                  );
                })}
              </div>
              <p className="muted" style={{ marginTop: 12 }}>
                Solo is free for a year for one company — we won&apos;t ask for
                your card until you add a second company or your year ends.
              </p>
              <button
                className="btn"
                type="button"
                disabled={selected !== "solo" || busy}
                onClick={() => setPhase("password")}
              >
                Continue with Solo free →
              </button>
            </>
          )}
          <p className="small" style={{ marginTop: 12 }}>
            Wrong email?{" "}
            <button type="button" onClick={useDifferentEmail} style={linkBtnStyle}>
              Use a different one
            </button>
          </p>
        </div>
      )}

      {/* ---------- Password: name + password + terms, then the code. ---------- */}
      {phase === "password" && (
        <form onSubmit={onPasswordSubmit}>
          {resumeEmail ? (
            <div className="notice">
              ✓ Email verified: <strong>{email.trim()}</strong>
            </div>
          ) : (
            <p className="muted">
              Creating the account for <strong>{email.trim()}</strong>
            </p>
          )}
          <div className="field">
            <label htmlFor="fullName">Account name</label>
            <input
              id="fullName"
              ref={nameRef}
              type="text"
              defaultValue=""
              minLength={2}
              maxLength={100}
              autoComplete="name"
              placeholder="e.g. Ahmed Khan"
            />
          </div>
          {/* Stable username for password managers: Chrome binds a generated
              password to the username present at generation time and REVOKES
              the fill if that field changes. Without this it pairs the
              password with the name field above, so every keystroke there
              empties the password. The email never changes → the fill sticks. */}
          <input
            type="email"
            name="username"
            value={email.trim()}
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            autoComplete="username"
            style={{
              position: "absolute",
              opacity: 0,
              height: 1,
              width: 1,
              pointerEvents: "none",
            }}
          />
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              ref={passwordRef}
              name="password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
            />
            <p className="small muted">
              At least 12 characters. We refuse passwords found in known leaks.
            </p>
          </div>
          <label className="check">
            <input ref={termsRef} type="checkbox" name="terms" value="on" required />
            <span className="small">
              I accept the Terms and Privacy Policy. Required.
            </span>
          </label>
          <button className="btn" type="submit" disabled={busy}>
            {busy
              ? resumeEmail
                ? "Creating account…"
                : "Sending code…"
              : "Create my account"}
          </button>
          <p className="small" style={{ marginTop: 12 }}>
            Wrong email?{" "}
            <button type="button" onClick={useDifferentEmail} style={linkBtnStyle}>
              Use a different one
            </button>
          </p>
        </form>
      )}

      {/* ---------- Code: proves inbox ownership, then finishes. ---------- */}
      {phase === "code" && (
        <div className="field">
          <label>Enter the 6-digit code sent to {email.trim()}</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyRef.current();
            }}
          >
            <div className="code-boxes" onPaste={onPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  disabled={verifyPending}
                  onChange={(e) => onDigit(i, e.target.value)}
                  onKeyDown={(e) => onDigitKey(i, e)}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
            <button
              className="btn"
              type="submit"
              disabled={verifyPending || code.length !== 6}
              style={{ marginTop: 14 }}
            >
              {verifyPending ? "Checking…" : "Verify code"}
            </button>
          </form>
          <div style={{ marginTop: 12 }}>
            {cooldown > 0 ? (
              <p className="small muted">Resend code in {cooldown}s</p>
            ) : (
              <button
                type="button"
                className="btn secondary small"
                disabled={busy}
                onClick={resend}
              >
                {busy ? "Sending…" : "Resend code"}
              </button>
            )}
            <p className="small muted" style={{ marginTop: 8 }}>
              No code in the email? Click the sign-in link inside it
              instead — you&apos;ll land back here, verified.
            </p>
            <p className="small" style={{ marginTop: 8 }}>
              Wrong email?{" "}
              <button type="button" onClick={useDifferentEmail} style={linkBtnStyle}>
                Use a different one
              </button>
            </p>
          </div>
        </div>
      )}

      {/* ---------- Finishing: account + free year activating. ---------- */}
      {phase === "finishing" && (
        <div className="notice">Creating your account… you&apos;ll be inside in a moment.</div>
      )}
    </div>
  );
}
