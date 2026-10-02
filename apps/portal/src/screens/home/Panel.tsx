import type { CompanyFacts } from '@boasis/schema';
import { addMonths, isBefore } from '@boasis/rules';
import { Link } from 'react-router-dom';
import { familyLabel, type DialFamily } from '../../components/Dial/families';
import { cx } from '../../components/shared/cx';
import { en } from '../../copy/en';
import type { Alert } from '../../lib/alerts';
import { companyColour } from '../../lib/brand';
import { colourSlotOf, colourVar } from '../../lib/companyColours';
import { daysLabel, type Entry } from '../../lib/entries';
import { formatShort } from '../../lib/format';
import { IconChevron } from '../../lib/icons';
import './home.css';

export interface PanelProps {
  readonly today: string;
  readonly alerts: readonly Alert[];
  readonly entries: readonly Entry[];
  // The companies on the home, for the colour of a row that has no entry of its own.
  readonly companies: readonly CompanyFacts[];
  readonly onOpenEntry: (entry: Entry) => void;
  readonly onOpenCompany: (id: string) => void;
}

// Due within this many days counts as approaching (the CEO's figure, also the strip's).
export const APPROACHING_DAYS = 15;
// How many rows a group shows before it hands over to its own list.
const ROWS_SHOWN = 3;

// One row in a group: the company's dot in its colour, the title, company and family, the date
// and the days. Where the row leads is decided by what it carries.
interface GroupRow {
  readonly key: string;
  readonly colour: string;
  readonly family: DialFamily;
  readonly title: string;
  readonly company: string;
  readonly date: string | null;
  readonly days: string;
  readonly tone: 'late' | 'soon' | null;
  readonly open: () => void;
}

interface Group {
  readonly id: 'urgent' | 'approaching' | 'upcoming';
  readonly title: string;
  readonly to: string;
  readonly rows: readonly GroupRow[];
  readonly empty: string | null;
}

function rowOf(entry: Entry, onOpen: (entry: Entry) => void): GroupRow {
  return {
    key: entry.id,
    colour: companyColour(entry.company),
    family: entry.family,
    title: entry.title,
    company: entry.companyName,
    date: entry.date,
    days: daysLabel(entry.days),
    tone: entry.days < 0 ? 'late' : entry.days <= APPROACHING_DAYS ? 'soon' : null,
    open: () => {
      onOpen(entry);
    },
  };
}

// Per-person requirements of one company fold into one row, "Staff visa renewals (2)", so the list
// stays short enough to read.
function fold(entries: readonly Entry[]): { entry: Entry; title: string }[] {
  const rows: { entry: Entry; title: string }[] = [];
  const counts = new Map<string, { at: number; count: number }>();
  for (const entry of entries) {
    if (entry.requirement?.subject === 'person') {
      const key = `${entry.company.id}:${entry.card.requirementId}`;
      const found = counts.get(key);
      if (found === undefined) {
        counts.set(key, { at: rows.length, count: 1 });
        rows.push({ entry, title: entry.requirement.title });
      } else {
        found.count += 1;
      }
      continue;
    }
    rows.push({ entry, title: entry.title });
  }
  for (const { at, count } of counts.values()) {
    const row = rows[at];
    if (row !== undefined && count > 1) {
      rows[at] = { ...row, title: `${row.title} (${String(count)})` };
    }
  }
  return rows;
}

export function groupsOf(
  today: string,
  alerts: readonly Alert[],
  entries: readonly Entry[],
  companies: readonly CompanyFacts[],
  onOpenEntry: (entry: Entry) => void,
  onOpenCompany: (id: string) => void,
): Group[] {
  const shown = new Set<string>();
  const urgent: GroupRow[] = [];
  // Overdue first: the only case where the product has already failed. Then what blocks a
  // renewal: the passport, the insurance.
  for (const entry of entries) {
    if (entry.status === 'upcoming' && entry.days < 0) {
      shown.add(entry.id);
      urgent.push(rowOf(entry, onOpenEntry));
    }
  }
  for (const alert of alerts) {
    if (alert.kind === 'overdue') {
      continue;
    }
    const entry = alert.entry;
    if (entry !== null) {
      if (shown.has(entry.id)) {
        continue;
      }
      shown.add(entry.id);
      urgent.push({ ...rowOf(entry, onOpenEntry), days: en.urgent.blocked, tone: 'late' });
      continue;
    }
    const person = alert.person;
    if (person === null) {
      continue;
    }
    urgent.push({
      key: alert.id,
      colour: colourVar(
        colourSlotOf(
          companies.find((company) => company.id === person.companyId) ?? {
            id: person.companyId,
          },
        ),
      ),
      family: 'visa',
      title: `${person.identity.name} · ${alert.blocks}`,
      company: alert.companyName,
      date: person.status.visaExpiry,
      days: en.urgent.blocked,
      tone: 'late',
      open: () => {
        onOpenCompany(person.companyId);
      },
    });
  }

  const horizon = addMonths(today, 3);
  const approaching: GroupRow[] = [];
  const upcoming: GroupRow[] = [];
  const later: Entry[] = [];
  for (const entry of entries) {
    if (entry.status !== 'upcoming' || shown.has(entry.id) || entry.days < 0) {
      continue;
    }
    if (entry.days <= APPROACHING_DAYS) {
      approaching.push(rowOf(entry, onOpenEntry));
    } else if (isBefore(entry.date, horizon)) {
      later.push(entry);
    }
  }
  for (const { entry, title } of fold(later)) {
    upcoming.push({ ...rowOf(entry, onOpenEntry), title });
  }

  return [
    {
      id: 'urgent',
      title: en.urgent.title,
      to: '/compliance?filter=urgent',
      rows: urgent,
      empty: null,
    },
    {
      id: 'approaching',
      title: en.urgent.approaching,
      to: '/compliance',
      rows: approaching,
      empty: en.urgent.nothingApproaching,
    },
    {
      id: 'upcoming',
      title: en.urgent.upcoming,
      to: '/calendar',
      rows: upcoming,
      empty: en.urgent.nothingUpcoming,
    },
  ];
}

// The side section beside the dial: three groups in lite's row language, each header a link
// to its own list. Urgent only shows when something is; a card that says "all fine" every
// morning becomes furniture.
export function Panel({
  today,
  alerts,
  entries,
  companies,
  onOpenEntry,
  onOpenCompany,
}: PanelProps) {
  const groups = groupsOf(today, alerts, entries, companies, onOpenEntry, onOpenCompany);
  return (
    <div className="hpanel">
      {groups.map((group) => {
        if (group.rows.length === 0 && group.empty === null) {
          return null;
        }
        const rest = group.rows.length - ROWS_SHOWN;
        return (
          <section
            key={group.id}
            className={cx('hgroup', `hgroup--${group.id}`)}
            aria-label={group.title}
          >
            <Link to={group.to} className="hgroup__head">
              <span className="hgroup__title">{group.title}</span>
              {group.rows.length > 0 ? (
                <span className="hgroup__n">{group.rows.length}</span>
              ) : null}
              <IconChevron className="hgroup__go" size={15} />
            </Link>
            {group.rows.length === 0 ? (
              <p className="hpanel__empty">{group.empty}</p>
            ) : (
              <ul className="hpanel__list">
                {group.rows.slice(0, ROWS_SHOWN).map((row) => (
                  <li key={row.key}>
                    <button type="button" className="hpanel__row" onClick={row.open}>
                      <span
                        className="hpanel__dot"
                        style={{ '--company-colour': row.colour }}
                        aria-hidden="true"
                      />
                      <span className="hpanel__text">
                        <span className="hpanel__title">{row.title}</span>
                        <span className="hpanel__sub">
                          {row.company} · {familyLabel(row.family)}
                        </span>
                      </span>
                      <span className="hpanel__end">
                        <span className="hpanel__date">{formatShort(row.date)}</span>
                        <span
                          className={cx(
                            'hpanel__days',
                            row.tone === 'soon' && 'hpanel__days--soon',
                            row.tone === 'late' && 'hpanel__days--late',
                          )}
                        >
                          {row.days}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {rest > 0 ? (
              <Link to={group.to} className="hgroup__more">
                {rest === 1 ? '1 more' : `${String(rest)} more`}
              </Link>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
