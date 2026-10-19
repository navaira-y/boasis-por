import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase';
import { mfaForVerifiedUser } from '@/lib/mfa';
import { routeForUser } from '@/lib/access';
import { MFA_RECOVERY_COPY, type MfaState } from '@boasis/schema';
import { MfaChallenge } from './verify-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Verify your authenticator' };

export default async function MfaPage() {
  const client = await serverSupabase();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user === null) redirect('/signin');
  if (user.email_confirmed_at == null) redirect('/signup');
  let state: MfaState | null = null;
  try {
    state = await mfaForVerifiedUser(client, user);
  } catch {
    /* No access decision from unavailable factors. */
  }
  if (state !== null && !state.requiresVerification) redirect(await routeForUser(client, user.id));
  return (
    <main className="shell stage">
      <section className="panel">
        <p className="eyebrow">Account security</p>
        <h1>Verify your authenticator</h1>
        {state === null ? (
          <div role="alert">
            <p>Could not check your security status. Your portal stays locked.</p>
            <a className="btn" href="/mfa">
              Try again
            </a>
          </div>
        ) : (
          <MfaChallenge state={state} />
        )}
        <form action="/auth/signout" method="post">
          <button
            className="btn btn-ghost btn-small"
            type="submit"
            style={{ marginBlockStart: 16 }}
          >
            Sign out
          </button>
        </form>
      </section>
      <aside className="aside">
        <h2>Your second step.</h2>
        <p>
          Open the authenticator app you linked to Boasis and enter its current six-digit code. This
          code is generated in the app, not sent by email.
        </p>
        <p className="lede-note">
          {MFA_RECOVERY_COPY} <a href="mailto:support@boasis.ae">Contact support</a>.
        </p>
      </aside>
    </main>
  );
}
