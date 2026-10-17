import { NavLink } from 'react-router-dom';
import { countdownLabel, subscriptionCountdown } from '@boasis/rules';
import { PRODUCT_PLAN_NAMES } from '@boasis/schema';
import { useBilling } from '../data/billing';

export function SubscriptionChip() {
  const { query, now } = useBilling();
  // On an error, don't keep advertising a cached period as if it were current.
  if (query.isError || query.data?.subscription == null) return null;
  const subscription = query.data.subscription;
  const countdown = subscriptionCountdown(subscription, now);
  if (countdown === null) return null;
  const label = countdownLabel(countdown);
  const warning =
    countdown.kind === 'ended' || (countdown.kind === 'remaining' && countdown.warning);
  const attributes = {
    className: `top-bar__subscription${warning ? ' top-bar__subscription--warn' : ''}`,
    'aria-label': `${PRODUCT_PLAN_NAMES[subscription.planId]}: ${label}. Review billing`,
    title: `${PRODUCT_PLAN_NAMES[subscription.planId]}: ${label}`,
    'data-testid': 'subscription-countdown',
  };
  return countdown.kind === 'remaining' ? (
    <NavLink {...attributes} to="/me/billing">
      {label}
    </NavLink>
  ) : (
    <a {...attributes} href="/billing">
      {label}
    </a>
  );
}
