import {
  addMonths,
  firstDayOfMonth,
  isBefore,
  isOnOrAfter,
  type RequirementKey,
} from '@boasis/rules';
import type { Card, IsoDate } from '@boasis/schema';
import { useParams } from 'react-router-dom';
import { CompanyMark } from '../components/CompanyMark/CompanyMark';
import { cx } from '../components/shared/cx';
import { compliance, screens } from '../copy/en';
import { useHomeData, type CompanyView } from '../data/bundles';
import { requirementOf, licenceFeeOf, subjectOf } from '../lib/cards';
import type { Bundle } from '../lib/entries';
import { formatMonth, formatShort } from '../lib/format';
import './lite.css';
import './compliance.css';

const copy = compliance.cost;

type CostKind = keyof typeof copy.kinds;

// Which dated requirements cost money (spec 5.5): licence and card renewals, the lease, visas,
// insurance, the audit, the tax dates. Everything else is a date, not a bill.
const COST_KIND: Readonly<Partial<Record<RequirementKey, CostKind>>> = {
  'licence-renewal': 'licence',
  'immigration-card-renewal': 'card',
  'mohre-card-renewal': 'card',
  'e-signature-card-renewal': 'card',
  'rent-instalment': 'lease',
  'office-lease-renewal': 'leaseEnd',
  'ejari-renewal': 'leaseEnd',
  'residence-visa-renewal': 'visa',
  'emirates-id-renewal': 'emiratesId',
  'work-permit-renewal': 'workPermit',
  'health-insurance-renewal': 'insurance',
  'unemployment-insurance': 'insurance',
  'audited-accounts': 'audit',
  'corporate-tax-return': 'tax',
  'vat-return': 'tax',
  'corporate-tax-registration': 'tax',
};

interface CostLine {
  readonly key: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly title: string;
  readonly detail: string;
  readonly dueOn: IsoDate;
  // Null: no fee is known for this line (rule 3: unknown, never a guess).
  readonly amountAed: number | null;
}

// The fee of one card: the instalment on the office, or the company's licence fee from the
// authority file (lib/cards licenceFeeOf). Anything else has no known fee.
function amountOf(card: Card, bundle: Bundle): { amount: number | null; detail: string } {
  const requirement = requirementOf(card);
  if (requirement?.key === 'rent-instalment') {
    const office = bundle.offices.find((entry) => entry.id === card.subjectId);
    const instalment = office?.lease.paymentSchedule.find((entry) => entry.dueOn === card.dueOn);
    return {
      amount: instalment?.amountAed ?? null,
      detail: office?.premises.address ?? '',
    };
  }
  if (requirement?.key === 'licence-renewal') {
    const fee = licenceFeeOf(bundle.authority.licence.fees?.value ?? null);
    if (fee !== null) {
      return { amount: fee.amountAed, detail: fee.name };
    }
  }
  return { amount: null, detail: subjectOf(card, bundle).name ?? '' };
}

function linesOf(views: readonly CompanyView[]): CostLine[] {
  const lines: CostLine[] = [];
  for (const { bundle } of views) {
    for (const card of bundle.cards) {
      const requirement = requirementOf(card);
      const kind = requirement === null ? undefined : COST_KIND[requirement.key];
      if (kind === undefined || card.dueOn === null || card.state === 'complete') {
        continue;
      }
      const { amount, detail } = amountOf(card, bundle);
      lines.push({
        key: card.id,
        companyId: bundle.facts.id,
        companyName: bundle.facts.identity.tradeName,
        title: copy.kinds[kind],
        detail,
        dueOn: card.dueOn,
        amountAed: amount,
      });
    }
  }
  return lines.sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

const aed = (value: number) => copy.known(value.toLocaleString('en-AE'));

// Screen 12 (spec 14) and spec 5.5: twelve months ahead, by month, across all companies. Fees
// come from the authority file and the person's own entries; a line without a known fee says
// so; totals count known fees only.
export function CostView() {
  // Under a company (/companies/:id/costs) only that company; /costs is every company.
  const { id } = useParams();
  const home = useHomeData();

  if (home.error !== null) {
    return <p role="alert">{home.error.message}</p>;
  }
  if (home.pending) {
    return (
      <p className="status" role="status">
        {screens.common.loading}
      </p>
    );
  }

  const lines = linesOf(
    id === undefined
      ? home.companies
      : home.companies.filter((view) => view.bundle.facts.id === id),
  );
  const first = firstDayOfMonth(home.today);
  const months = Array.from({ length: 12 }, (_, index) => ({
    start: addMonths(first, index),
    end: addMonths(first, index + 1),
  }));
  const byMonth = months.map(({ start, end }) => {
    const inMonth = lines.filter(
      (line) => isOnOrAfter(line.dueOn, start) && isBefore(line.dueOn, end),
    );
    const known = inMonth.reduce((sum, line) => sum + (line.amountAed ?? 0), 0);
    const unknown = inMonth.filter((line) => line.amountAed === null).length;
    return { start, lines: inMonth, known, unknown };
  });
  const total = byMonth.reduce((sum, month) => sum + month.known, 0);
  const totalUnknown = byMonth.reduce((sum, month) => sum + month.unknown, 0);

  return (
    <div className="pg costs">
      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
        </div>
      </div>

      <div className="ctotal">
        <span>
          <span className="ctotal__k">{copy.total}</span>
          <span className="ctotal__s">{copy.totalNote}</span>
        </span>
        <span style={{ textAlign: 'end' }}>
          <span className="ctotal__v">{aed(total)}</span>
          {totalUnknown > 0 ? (
            <span className="ctotal__s">{copy.unknownCount(totalUnknown)}</span>
          ) : null}
        </span>
      </div>

      {byMonth.map((month) => (
        <section className="cmonth" key={month.start} aria-label={formatMonth(month.start)}>
          <div className="cmonth__head">
            <h3 className="cmonth__name">{formatMonth(month.start)}</h3>
            <span className="cmonth__sum">
              {aed(month.known)}
              {month.unknown > 0 ? (
                <span className="cmonth__note">{copy.unknownCount(month.unknown)}</span>
              ) : null}
            </span>
          </div>
          {month.lines.length === 0 ? <p className="quiet">{copy.empty}</p> : null}
          {month.lines.map((line) => (
            <div className="cline" key={line.key}>
              <CompanyMark name={line.companyName} id={line.companyId} size="sm" />
              <span className="cline__bd">
                <span className="cline__t">{line.title}</span>
                <span className="cline__s">
                  {[line.companyName, formatShort(line.dueOn), line.detail]
                    .filter((part) => part !== '')
                    .join(' · ')}
                </span>
              </span>
              <span className={cx('cline__v', line.amountAed === null && 'cline__v--unknown')}>
                {line.amountAed === null ? copy.unknown : aed(line.amountAed)}
              </span>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
