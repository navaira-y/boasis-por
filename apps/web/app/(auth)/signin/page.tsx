import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase';
import { routeForUser } from '@/lib/access';
import { SignInForm } from './signin-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in',
};

/** Returning visits only: a signed-in visitor is sent where they belong. */
export default async function SignInPage() {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email_confirmed_at != null) {
    redirect(await routeForUser(supabase, user.id));
  }

  return (
    <main className="shell stage">
      <section className="panel">
        <SignInForm />
      </section>
      <aside className="aside">
        <h2>Your file, your dates.</h2>
        <p>
          Signing in opens the portal: the company file, the calendar of what is due, the plain
          steps for your zone, and the vault with every document.
        </p>
        <p className="lede-note">
          No account yet?{' '}
          <a href="/signup">Creating one takes an email and a six-digit code</a>, and your first
          year for one company is free.
        </p>
      </aside>
    </main>
  );
}
