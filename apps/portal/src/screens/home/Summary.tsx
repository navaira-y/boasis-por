import type { AuthorityFile, CompanyFacts } from '@boasis/schema';
import { cx } from '../../components/shared/cx';
import { en } from '../../copy/en';
import { kindLabel, placeOf, shortNameOf, type Entry } from '../../lib/entries';
import { plural } from '../../lib/format';
import './home.css';

export interface SummaryProps {
  readonly companies: readonly {
    readonly facts: CompanyFacts;
    readonly authority: AuthorityFile;
  }[];
  readonly entries: readonly Entry[];
  readonly isAll: boolean;
  // Inside a company the eyebrow is dropped: the header above already says it.
  readonly compact?: boolean;
  // The figures under the line. Off on the home stage (the CEO: cleaner), on elsewhere.
  readonly stats?: boolean;
  readonly className?: string;
}

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

import { APPROACHING_DAYS } from './Panel';

// Lite's summary beside the dial: an eyebrow, a title, one line, and the figures: the companies,
// and what is due within fifteen days. A passed date changes what the screen has the right to
// say: it never announces "all in good standing" with two dates nine days late just below.
export function Summary({
  companies,
  entries,
  isAll,
  compact = false,
  stats = true,
  className,
}: SummaryProps) {
  const next = entries[0];
  // The strip's second figure is the Approaching group's count: due within fifteen days and not
  // yet passed. A passed date is Urgent, and is counted there, never twice.
  const soon = entries.filter((entry) => entry.days >= 0 && entry.days <= APPROACHING_DAYS).length;
  const late = entries.filter((entry) => entry.days < 0);
  const first = companies[0];
  // Several companies: the authorities by their short names, so the eyebrow stays one line.
  const places = [...new Set(companies.map((company) => shortNameOf(company.authority)))].join(
    ', ',
  );
  const companyEyebrow =
    first === undefined ? '' : [kindLabel(first.authority), placeOf(first.authority)].join(' · ');
  const nameOf = (facts: CompanyFacts) => facts.identity.tradeName;

  let eyebrow: string;
  let title: string;
  let line: string;
  const overdue = late[0];
  if (overdue !== undefined) {
    eyebrow = isAll
      ? fill(plural(companies.length, en.year.companiesIn.one, en.year.companiesIn.other), {
          places,
        })
      : companyEyebrow;
    title = plural(late.length, en.year.someLate.one, en.year.someLate.other);
    line = fill(plural(-overdue.days, en.year.lateLine.one, en.year.lateLine.other), {
      what: overdue.title,
    });
  } else if (isAll) {
    eyebrow = fill(plural(companies.length, en.year.companiesIn.one, en.year.companiesIn.other), {
      places,
    });
    title = en.year.allGood;
    line =
      next === undefined
        ? ''
        : fill(en.year.nothingOverdueAll, { what: next.title, company: nameOf(next.company) });
  } else {
    eyebrow = companyEyebrow;
    title = first === undefined ? '' : fill(en.year.companyGood, { company: nameOf(first.facts) });
    line = next === undefined ? '' : fill(en.year.nothingOverdue, { what: next.title });
  }

  return (
    <div
      className={cx('ysum', compact && 'ysum--tight', late.length > 0 && 'ysum--late', className)}
    >
      {compact ? null : <div className="ysum__k">{eyebrow}</div>}
      <h2 className="ysum__title">{title}</h2>
      <p className="ysum__line">{line}</p>
      {stats ? (
        <div className="ysum__stats">
          {isAll ? (
            <div>
              <div className="ysum__v">{companies.length}</div>
              <div className="ysum__l">
                {plural(
                  companies.length,
                  en.year.statCompanies.one,
                  en.year.statCompanies.other,
                ).replace(/^\d+ /, '')}
              </div>
            </div>
          ) : null}
          <div>
            <div className="ysum__v">{soon}</div>
            <div className="ysum__l">
              <span className="ysum__lg">{en.year.statSoonLong}</span>
              <span className="ysum__sm">{en.year.statSoon}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
