import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { BILLING_COPY, PRODUCT_PLAN_NAMES, type BillingSnapshot } from '@boasis/schema';
import { serverSupabase } from '@/lib/supabase';
import { hasProfile } from '@/lib/access';
import { billingForUser } from '@/lib/billing';
import { StartFreeYear } from './start-free-year';
import { PeriodDetails } from './period-details';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your plan' };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user === null) redirect('/signin?next=/billing');
  if (!user.email_confirmed_at) redirect('/signup');
  if (!(await hasProfile(supabase, user.id))) redirect('/signup');
  let snapshot: BillingSnapshot | null = null;
  try {
    snapshot = await billingForUser(supabase, user.id);
  } catch {
    /* Honest retry below, not an assumed free year. */
  }
  const params = await searchParams;
  const subscription = snapshot?.subscription ?? null;
  return (
    <main className="shell stage">
      <section className="panel">
        <p className="eyebrow">Boasis portal</p>
        <h1>
          {snapshot === null
            ? 'Your subscription is unavailable'
            : subscription === null
              ? 'Your plan is not set up yet'
              : `Your ${PRODUCT_PLAN_NAMES[subscription.planId]} plan`}
        </h1>
        {params.setup === 'activation' ? (
          <div className="error" role="alert">
            <strong>One step did not finish</strong>Your account and inbox are ready. Starting the
            free year did not finish. You can try again below.
          </div>
        ) : null}
        {snapshot === null ? (
          <div role="alert">
            <p>Could not load your subscription. No plan details have been assumed.</p>
            <a className="btn" href="/billing">
              Try again
            </a>
          </div>
        ) : subscription === null ? (
          <>
            <p className="lede">
              No subscription is set up for this account. Eligible accounts can start their free
              Solo year after email verification.
            </p>
            <StartFreeYear />
          </>
        ) : (
          <PeriodDetails
            subscription={subscription}
            plans={snapshot.plans}
            initialNow={Date.now()}
          />
        )}
        <p className="hint" style={{ marginBlockStart: 18 }}>
          Questions about a plan? <a href="mailto:support@boasis.ae">Contact us</a>.
        </p>
        <form action="/auth/signout" method="post">
          <button className="btn btn-ghost btn-small" type="submit" style={{ marginBlockStart: 8 }}>
            Sign out
          </button>
        </form>
      </section>
      <aside className="aside">
        <h2>Payment, when it arrives.</h2>
        <p>{BILLING_COPY.payment}</p>
        <p>{BILLING_COPY.solo}</p>
        <p>{BILLING_COPY.trio}</p>
        <p>
          {BILLING_COPY.enterprise} <a href="mailto:support@boasis.ae">Contact us</a>.
        </p>
        <p className="lede-note">{BILLING_COPY.earlyAccess}</p>
      </aside>
    </main>
  );
}
