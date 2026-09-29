"use client";

import { useActionState } from "react";
import { demoAddCompany, type DemoState } from "./actions";

const initialState: DemoState = { ok: false };

export function DemoAddCompanyForm({ canAdd }: { canAdd: boolean }) {
  const [state, formAction, pending] = useActionState(demoAddCompany, initialState);

  return (
    <form action={formAction}>
      {!state.ok && state.error && <div className="error">{state.error}</div>}
      {state.ok && state.message && <div className="notice">{state.message}</div>}
      <div className="field">
        <label htmlFor="licence">Licence number (IFZA demo)</label>
        <input id="licence" name="licenceNumber" type="text" required maxLength={64} placeholder="e.g. 123456" />
      </div>
      <button className="btn" type="submit" disabled={pending || !canAdd}>
        {pending ? "Adding…" : canAdd ? "Add company" : "Plan limit reached"}
      </button>
    </form>
  );
}
