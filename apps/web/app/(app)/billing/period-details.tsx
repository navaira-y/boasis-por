'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProductPlan, Subscription } from '@boasis/schema';
import {
  afterPeriodLine,
  canUseSubscription,
  countdownLabel,
  isFreeYear,
  nextSubscriptionClockDelay,
  subscriptionCountdown,
  subscriptionStatusLabel,
} from '@boasis/rules';
import { StartFreeYear } from './start-free-year';

export function PeriodDetails({
  subscription,
  plans,
  initialNow,
}: {
  subscription: Subscription;
  plans: ProductPlan[];
  initialNow: number;
}) {
  const [now, setNow] = useState(initialNow);
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sync = () => {
      clearTimeout(timer);
      const instant = Date.now();
      setNow(instant);
      timer = setTimeout(sync, nextSubscriptionClockDelay(instant, subscription.periodEnd));
    };
    const refresh = () => {
      sync();
      if (document.visibilityState === 'visible') router.refresh();
    };
    sync();
    const revalidate = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      clearInterval(revalidate);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [subscription.periodEnd, router]);
  const countdown = subscriptionCountdown(subscription, now);
  const plan = plans.find((item) => item.id === subscription.planId);
  const canEnter = canUseSubscription(subscription, now);
  const eligible =
    subscription.planId === 'solo' &&
    (subscription.provider === 'stub' || subscription.provider === 'free') &&
    (subscription.status === 'pending' || subscription.status === 'incomplete') &&
    subscription.freeYearUsedAt === null;
  const end =
    subscription.periodEnd === null
      ? 'Not available'
      : new Date(subscription.periodEnd).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Dubai',
        });
  return (
    <>
      <div className="rows" style={{ marginBlock: '4px 18px' }}>
        <div className="row">
          <span className="muted">Status</span>
          <b>{subscriptionStatusLabel(subscription, now)}</b>
        </div>
        <div className="row">
          <span className="muted">
            {isFreeYear(subscription) ? 'Free year ends' : 'Current period ends'} (Asia/Dubai)
          </span>
          <b>{end}</b>
        </div>
        <div className="row">
          <span className="muted">Time remaining</span>
          <b data-testid="billing-countdown">
            {countdown === null ? 'Not available' : countdownLabel(countdown)}
          </b>
        </div>
        <div className="row">
          <span className="muted">After this period</span>
          <b>{afterPeriodLine(subscription, plan)}</b>
        </div>
      </div>
      {canEnter ? (
        <>
          {isFreeYear(subscription) ? (
            <p className="lede">Your first year is free. No card required.</p>
          ) : null}
          <a className="btn" href="/portal">
            Open my portal
          </a>
        </>
      ) : eligible ? (
        <>
          <p className="lede">
            Eligible accounts can start their free Solo year after email verification.
          </p>
          <StartFreeYear />
        </>
      ) : (
        <>
          <p className="lede">
            Your portal access is not active. Online payment opens soon; no card is collected here.
          </p>
          <div className="card-callout">
            Solo covers one company. Payment is only requested for a second company or after the
            free year ends.
          </div>
        </>
      )}
    </>
  );
}
