"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signinAction, type SigninState } from "./actions";

const idle: SigninState = { ok: false };

export function SigninForm() {
  const [state, action, pending] = useActionState(signinAction, idle);

  return (
    <form action={action}>
      {!state.ok && state.error && <div className="error">{state.error}</div>}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="small muted" style={{ marginTop: 16 }}>
        New here? <Link href="/signup">Create your account</Link>
      </p>
    </form>
  );
}
