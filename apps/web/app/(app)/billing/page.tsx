import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase';
import { accessForUser, hasProfile } from '@/lib/access';
import { formatAED } from '@/lib/plans';
import type { SubscriptionStatus } from '@/lib/gate';
import { StartFreeYear } from './start-free-year';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Your plan',
};

function planLabel(planId: string | null): string {
  const value = planId ?? 'solo';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusLabel(status: SubscriptionStatus | null): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'past_due':
      return 'Paused, payment due';
    case 'canceled':
      return 'Cancelled';
    case 'incomplete':
      return 'Not finished';
    case 'pending':
      return 'Not started';
    default:
      return 'Not started';
  }
}

function longDate(value: string | null): string {
  if (value === null) return 'not set yet';
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dubai',
  });
}

/**
 * The honest money page. There is no gateway yet (Ziina keys arrive later), so
 * this page never pretends to take a card: it states the free year, when it
 * ends, and exactly what happens then. Both payment trigger points named in
 * the brief land here: the second-company block and the end of the free year.
 */
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
  if (!(await hasProfile(supabase, user.id))) redirect('/signup');

  const access = await accessForUser(supabase, user.id);
  const params = await searchParams;
  const setupFailed = params.setup === 'activation';

  const headline = access.canEnterPortal
    ? 'Your first year is free'
    : access.status === 'past_due'
      ? 'Your free year has ended'
      : access.status === 'canceled'
        ? 'Your plan is cancelled'
        : 'Your plan is not active yet';

  const today = new Date();
  const daysLeft =
    access.periodEnd === null
      ? null
      : Math.max(0, Math.ceil((new Date(access.periodEnd).getTime() - today.getTime()) / 86_400_000));

  return (
    <main className="shell stage">
      <section className="panel">
        <p className="eyebrow">Boasis portal</p>
        <h1>{headline}</h1>
        {setupFailed && (
          <div className="error" role="alert">
            <strong>One step did not finish</strong>
            Your account and your inbox are ready; the step that starts the free year did not run.
            Press the button below, or write to support@boasis.ae and we will finish it.
          </div>
        )}

        <div className="rows" style={{ marginBlock: '4px 18px' }}>
          <div className="row">
            <span className="muted">Plan</span>
            <b>{planLabel(access.planId)}</b>
          </div>
          <div className="row">
            <span className="muted">Status</span>
            <b>{statusLabel(access.status)}</b>
          </div>
          <div className="row">
            <span className="muted">Free year ends</span>
            <b>{longDate(access.periodEnd)}</b>
          </div>
          <div className="row">
            <span className="muted">After that</span>
            <b>{formatAED(3000, 'AED')} per month, one company</b>
          </div>
        </div>

        {access.canEnterPortal ? (
          <>
            <p className="lede">
              {daysLeft === null
                ? 'Nothing to pay today.'
                : `Nothing to pay today. ${String(daysLeft)} day${daysLeft === 1 ? '' : 's'} of free access left, and we will email you before it ends.`}
            </p>
            <a className="btn" href="/portal">
              Open my portal
            </a>
          </>
        ) : access.status === null || access.status === 'pending' ? (
          <>
            <p className="lede">
              Your free year is started from the account itself. If the button does not work, write
              to support@boasis.ae and it will be finished by hand the same day.
            </p>
            <StartFreeYear />
          </>
        ) : (
          <>
            <p className="lede">
              The portal stays locked until a payment is set up. Card payments are not switched on
              yet: when they are, you will get an email with a payment link, and nothing can be
              charged before you use it.
            </p>
            <div className="card-callout">
              Adding a second company will also ask for payment at that moment, because the free
              year covers one company.
            </div>
          </>
        )}

        <p className="hint" style={{ marginBlockStart: 18 }}>
          Questions about a charge or a plan? Write to support@boasis.ae. We reply with a person,
          never a template.
        </p>
        <form action="/auth/signout" method="post">
          <button className="btn btn-ghost btn-small" type="submit" style={{ marginBlockStart: 8 }}>
            Sign out
          </button>
        </form>
      </section>
      <aside className="aside">
        <h2>Payment, when it arrives.</h2>
        <p>
          Boasis takes payment through Ziina, a UAE gateway. Until that is switched on, no card is
          asked for anywhere in this product, and there is nothing to cancel.
        </p>
        <p className="lede-note">
          Two moments will ask for payment, and only two: adding a second company, and the end of
          your free year. Both send an email first.
        </p>
      </aside>
    </main>
  );
}
