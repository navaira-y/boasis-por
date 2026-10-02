import { me } from '../../copy/en';
import { useAccessGrants, useHomeData } from '../../data';
import { PLAN } from '../../lib/plan';
import { MeHead } from './rows';
import '../lite.css';
import '../ReminderSettings.css';
import '../Account.css';

// Billing (screen 18): the plan, what is used of it, and the working model of spec 12.1 as
// plain rows. Every figure is an example, and it says so; no payment is taken here.
export function Billing() {
  const home = useHomeData();
  const grants = useAccessGrants();
  const companies = home.companies.map((view) => view.bundle);
  const members = (grants.data ?? []).filter((grant) => grant.companies.length > 0).length;

  return (
    <div className="pg acct">
      <MeHead title={me.billing.title} sub={me.billing.sub} />

      <div className="abox">
        <div className="arow keep">
          <span className="k">{me.billing.plan}</span>
          <span className="v">
            {me.billing.standard}
            <small>{me.billing.trial(PLAN.trialDays)}</small>
          </span>
        </div>
      </div>

      <div className="abox">
        <div className="hd">
          <h3>{me.billing.used}</h3>
        </div>
        <div className="arow keep">
          <span className="k">{me.panel.companies}</span>
          <span className="v">
            {me.billing.companies(companies.length, PLAN.companiesIncluded)}
          </span>
        </div>
        <div className="arow keep">
          <span className="k">{me.panel.access}</span>
          <span className="v">{me.billing.members(members, PLAN.membersIncluded)}</span>
        </div>
        <div className="arow keep">
          <span className="k">{me.billing.peopleLabel}</span>
          <span className="v">
            {me.billing.people(PLAN.peopleCapPerCompany)}
            {companies.map((bundle) => (
              <small key={bundle.facts.id}>
                {me.billing.peopleUsed(
                  bundle.facts.identity.tradeName,
                  bundle.people.length,
                  PLAN.peopleCapPerCompany,
                )}
              </small>
            ))}
          </span>
        </div>
      </div>

      <div className="abox">
        <div className="hd">
          <h3>{me.billing.model}</h3>
          <p>{me.billing.modelNote}</p>
        </div>
        <div className="arow keep">
          <span className="k">{me.billing.owner}</span>
          <span className="v">
            {me.billing.perMonth(PLAN.ownerPriceAed)}
            <small>{me.billing.ownerNote}</small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">{me.billing.member}</span>
          <span className="v">
            {me.billing.perMonth(PLAN.memberPriceAed)}
            <small>{me.billing.memberNote}</small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">{me.billing.addOns}</span>
          <span className="v">
            <small>{me.billing.addOnsNote(PLAN.peopleAddOnBlock)}</small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">{me.billing.notices}</span>
          <span className="v">
            <small>{me.billing.noticesNote}</small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">{me.billing.closed}</span>
          <span className="v">
            <small>{me.billing.closedNote}</small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">{me.billing.enterprise}</span>
          <span className="v">
            <small>{me.billing.enterpriseNote(PLAN.peopleHardLine)}</small>
          </span>
        </div>
        <div className="arow keep">
          <span className="k">{me.billing.nonPayment}</span>
          <span className="v">
            <small>
              {me.billing.nonPaymentNote(PLAN.graceDays, PLAN.readOnlyDays, PLAN.exportMonths)}
            </small>
          </span>
        </div>
      </div>

      <div className="vers">{me.billing.noPayment}</div>
    </div>
  );
}
