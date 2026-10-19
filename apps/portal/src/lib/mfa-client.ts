import { MfaReply, type MfaOperation } from '@boasis/schema';

// Browser boundary: no secret, code, challenge, or session is persisted here.
export async function requestMfa(operation: MfaOperation | null): Promise<MfaReply> {
  try {
    const response = await fetch('/api/security/mfa', {
      method: operation === null ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      ...(operation === null
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation) }),
    });
    const result: unknown = await response.json();
    return MfaReply.parse(result);
  } catch {
    return {
      ok: false,
      code: 'UNAVAILABLE',
      error: 'Could not confirm your security status. Reload and check before trying again.',
    };
  }
}

export function reloadSecurity(): void {
  window.location.reload();
}

export function signOutOfServer(): void {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/auth/signout';
  document.body.append(form);
  form.submit();
}
