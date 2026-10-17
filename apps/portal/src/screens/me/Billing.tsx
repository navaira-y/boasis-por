import { BILLING_COPY, PRODUCT_PLAN_NAMES } from '@boasis/schema';
import {
  afterPeriodLine,
  countdownLabel,
  isFreeYear,
  subscriptionCountdown,
  subscriptionStatusLabel,
} from '@boasis/rules';
import { me } from '../../copy/en';
import { useCompanyAllowance } from '../../data/company-allowance';
import { useBilling } from '../../data/billing';
import { MeHead } from './rows';
import '../lite.css';
import '../ReminderSettings.css';
import '../Account.css';

function longDate(value: string): string {
  return new Date(value).toLocaleDateString('en-GB', {
    timeZone: 'Asia/Dubai',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// The team's existing boxes and rows, with the signed-in account's subscription.
// Published offers below are not an entitlement or a fabricated subscription.
export function Billing() {
  const { query, now } = useBilling();
  const allowance = useCompanyAllowance();
  const subscription = query.data?.subscription ?? null;
  const plan = query.data?.plans.find((item) => item.id === subscription?.planId);
  const countdown = subscriptionCountdown(subscription, now);
  return (
    <div className="pg acct">
      <MeHead title={me.billing.title} sub={me.billing.sub} />
      {query.isPending ? (
        <p role="status">Loading your subscription...</p>
      ) : query.isError ? (
        <div className="abox">
          <p className="arow" role="alert">
            Could not load your subscription. No plan details have been assumed.
          </p>
          <button
            type="button"
            className="add"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </button>
        </div>
      ) : subscription === null ? (
        <div className="abox">
          <p className="arow" role="status">
            No subscription is set up for this account.
          </p>
          <a className="arow" href="/billing">
            Review access
          </a>
        </div>
      ) : (
        <>
          <div className="abox">
            <div className="arow keep">
              <span className="k">Plan</span>
              <span className="v">
                {PRODUCT_PLAN_NAMES[subscription.planId]}
                {isFreeYear(subscription) ? <small>Free year, no card required</small> : null}
              </span>
            </div>
            <div className="arow keep">
              <span className="k">Status</span>
              <span className="v">{subscriptionStatusLabel(subscription, now)}</span>
            </div>
            <div className="arow keep">
              <span className="k">
                {isFreeYear(subscription) ? 'Free year ends' : 'Current period ends'}
              </span>
              <span className="v">
                {subscription.periodEnd === null
                  ? 'Not available'
                  : longDate(subscription.periodEnd)}
                <small>Asia/Dubai</small>
              </span>
            </div>
            <div className="arow keep">
              <span className="k">Time remaining</span>
              <span className="v" data-testid="billing-countdown">
                {countdown === null ? 'Not available' : countdownLabel(countdown)}
              </span>
            </div>
            <div className="arow keep">
              <span className="k">After this period</span>
              <span className="v">{afterPeriodLine(subscription, plan)}</span>
            </div>
          </div>
          <div className="abox">
            <div className="hd">
              <h3>Company allowance</h3>
            </div>
            <div className="arow keep">
              <span className="k">Owned companies</span>
              <span className="v">
                {allowance.isError || allowance.data === undefined
                  ? 'Allowance unavailable'
                  : `${String(allowance.data.ownedCompanies)} of ${String(allowance.data.companyLimit)} currently available`}
              </span>
            </div>
            <div className="arow keep">
              <span className="k">Adding a company</span>
              <span className="v">
                <small>
                  Solo covers one company. Online payment opens soon to unlock a second company.
                </small>
              </span>
            </div>
          </div>
        </>
      )}
      <div className="abox">
        <div className="hd">
          <h3>Plans</h3>
        </div>
        <div className="arow keep">
          <span className="k">Solo</span>
          <span className="v">
            <small>{BILLING_COPY.solo}</small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">Trio</span>
          <span className="v">
            <small>{BILLING_COPY.trio}</small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">Enterprise</span>
          <span className="v">
            <small>
              {BILLING_COPY.enterprise} <a href="mailto:support@boasis.ae">Contact us</a>
            </small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">Early access</span>
          <span className="v">
            <small>{BILLING_COPY.earlyAccess}</small>
          </span>
        </div>
      </div>
      <div className="vers">{BILLING_COPY.payment}</div>
    </div>
  );
}
