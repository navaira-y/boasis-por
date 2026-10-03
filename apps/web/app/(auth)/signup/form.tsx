"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  completeSignupAction,
  sendCodeAction,
  verifyCodeAction,
  type AuthState,
} from "./actions";
const idle: AuthState = { ok: false };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Phase = "email" | "code" | "verified";

export function SignupForm({
  next,
  resumeEmail,
}: {
  next: string;
  resumeEmail: string | null;
}) {
  const [phase, setPhase] = useState<Phase>(resumeEmail ? "verified" : "email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(resumeEmail ?? "");
  const [emailTouched, setEmailTouched] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // The name locks ONLY on the code→verified transition with a complete name
  // (normal flow). A resumed signup starts verified with an EMPTY name, so it
  // must stay editable — locking on "verified + 2 chars" froze resume users
  // after two keystrokes.
  const [nameLocked, setNameLocked] = useState(false);
  const prevPhase = useRef<Phase>(resumeEmail ? "verified" : "email");

  const nameValid = name.trim().length >= 2;
  const emailValid = EMAIL_RE.test(email.trim());
  const canSend = nameValid && emailValid;

  const [sendState, sendAction, sendPending] = useActionState(sendCodeAction, idle);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyCodeAction, idle);
  const [doneState, doneAction, donePending] = useActionState(completeSignupAction, idle);

  // Code boxes
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);
  const verifyFormRef = useRef<HTMLFormElement>(null);
  const code = digits.join("");

  // Code sent → move to code phase + start resend cooldown.
  useEffect(() => {
    if (sendState.ok) {
      setPhase("code");
      setCooldown(60);
    }
  }, [sendState]);

  // Code correct → reveal the rest.
  useEffect(() => {
    if (verifyState.ok) setPhase("verified");
  }, [verifyState]);

  // Lock the name on the transition into verified (normal flow only — a
  // resume starts verified, so it never transitions and stays editable).
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = phase;
    if (was !== "verified" && phase === "verified" && name.trim().length >= 2) {
      setNameLocked(true);
    }
  }, [phase, name]);

  // Wrong code → clear boxes so the user retypes cleanly.
  useEffect(() => {
    if (!verifyState.ok && verifyState.error) {
      setDigits(["", "", "", "", "", ""]);
      boxRefs.current[0]?.focus();
    }
  }, [verifyState]);

  // Focus first box when the code step appears.
  useEffect(() => {
    if (phase === "code") boxRefs.current[0]?.focus();
  }, [phase]);

  // Resend cooldown ticker. Stops once verified — zero re-renders while the
  // password is being entered.
  useEffect(() => {
    if (cooldown <= 0 || phase === "verified") return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown, phase]);

  // Auto-check once all 6 digits are in.
  useEffect(() => {
    if (code.length === 6 && phase === "code") verifyFormRef.current?.requestSubmit();
  }, [code, phase]);

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
    setNameLocked(false);
    setDigits(["", "", "", "", "", ""]);
  }

  return (
    <div>
      {/* ---------- Section A: name + email + code ---------- */}
      <div className="field">
        <label htmlFor="fullName">Account name</label>
        <input
          id="fullName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={nameLocked && phase === "verified"}
          minLength={2}
          maxLength={100}
          autoComplete="name"
          placeholder="e.g. Ahmed Khan"
        />
        {phase === "verified" && name.trim().length < 2 && (
          <p className="small muted" style={{ marginTop: 8 }}>
            The email link opened a fresh page, so please add your account name to finish.
          </p>
        )}
      </div>

      {phase === "verified" ? (
        <div className="notice">
          ✓ Email verified: <strong>{email.trim()}</strong>
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              disabled={phase === "code"}
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
            <p className="small muted">Sign-in and all reminders go here.</p>
          </div>

          {phase === "email" && (
            <form action={sendAction}>
              <input type="hidden" name="email" value={email.trim()} />
              {!sendState.ok && sendState.error && (
                <div className="error">{sendState.error}</div>
              )}
              {canSend && (
                <>
                  <button className="btn" type="submit" disabled={sendPending}>
                    {sendPending ? "Sending code…" : "Send verification code"}
                  </button>
                  <p className="small muted" style={{ marginTop: 10 }}>
                    A 6-digit code will be sent to this email. You&apos;ll need
                    it before payment.
                  </p>
                </>
              )}
            </form>
          )}

          {phase === "code" && (
            <div className="field">
              <label>Enter the 6-digit code sent to {email.trim()}</label>
              <form action={verifyAction} ref={verifyFormRef}>
                <input type="hidden" name="email" value={email.trim()} />
                <input type="hidden" name="code" value={code} />
                {!verifyState.ok && verifyState.error && (
                  <div className="error">{verifyState.error}</div>
                )}
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
                  <form action={sendAction} style={{ display: "inline" }}>
                    <input type="hidden" name="email" value={email.trim()} />
                    <button
                      type="submit"
                      className="btn secondary small"
                      disabled={sendPending}
                    >
                      {sendPending ? "Sending…" : "Resend code"}
                    </button>
                  </form>
                )}
                <p className="small muted" style={{ marginTop: 8 }}>
                  No code in the email? Click the sign-in link inside it
                  instead — you&apos;ll land back here, verified.
                </p>
                <p className="small" style={{ marginTop: 8 }}>
                  Wrong email?{" "}
                  <button
                    type="button"
                    onClick={useDifferentEmail}
                    style={{
                      background: "none",
                      border: 0,
                      padding: 0,
                      color: "#5FD3E8",
                      cursor: "pointer",
                      fontSize: "inherit",
                    }}
                  >
                    Use a different one
                  </button>
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ---------- Section B: password + plan + terms (after verify) ---------- */}
      {phase === "verified" && (
        <form action={doneAction} style={{ marginTop: 8 }}>
          <input type="hidden" name="next" value={next} />
          <input type="hidden" name="fullName" value={name.trim()} />
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
          {!doneState.ok && doneState.error && (
            <div className="error">{doneState.error}</div>
          )}

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
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

          <p className="small muted">
            You&apos;ll choose your plan on the next step — nothing is
            preselected.
          </p>

          <label className="check">
            <input type="checkbox" name="terms" value="on" required />
            <span className="small">
              I accept the Terms and Privacy Policy. Required.
            </span>
          </label>

          <button className="btn" type="submit" disabled={donePending}>
            {donePending ? "Creating account…" : "Create account & continue to payment"}
          </button>
        </form>
      )}
    </div>
  );
}
