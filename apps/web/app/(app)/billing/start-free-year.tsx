'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { startFreeYearAction } from './actions';

/** The one button that finishes setup when the free year never landed. */
export function StartFreeYear() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const result = await startFreeYearAction();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? 'Could not start the free year. Please try again.');
      return;
    }
    router.push('/portal');
  }

  return (
    <div>
      {error !== null && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button
        className="btn"
        type="button"
        onClick={() => {
          void start();
        }}
        disabled={busy}
      >
        {busy ? 'Starting your free year…' : 'Start my free year'}
      </button>
    </div>
  );
}
