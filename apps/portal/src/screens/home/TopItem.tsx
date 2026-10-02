import { cx } from '../../components/shared/cx';
import { en } from '../../copy/en';
import type { Alert } from '../../lib/alerts';
import { companyColour } from '../../lib/brand';
import type { Entry } from '../../lib/entries';
import { formatShort, plural } from '../../lib/format';
import type { TopItem as Top } from '../../lib/topItem';
import './home.css';

export type HomeTop = Top<Entry, Alert>;

// The label says why this item was chosen: urgent for a passed date or a blocked renewal within
// thirty days, due soon within fifteen days, upcoming otherwise.
function labelOf(reason: HomeTop['reason']): string {
  switch (reason) {
    case 'overdue':
    case 'blocked':
      return en.urgent.title;
    case 'soon':
      return en.urgent.dueSoon;
    case 'next':
      return en.urgent.topLabel;
  }
}

// A blocked renewal is named by what blocks it; everything else by its own title. The dial hub
// and the block beside it both use this, so they say the same thing.
export function topTitle(top: HomeTop): string {
  const person = top.alert?.person ?? null;
  if (top.alert !== null && person !== null) {
    const template =
      top.alert.kind === 'insurance' ? en.urgent.insuranceBlocks : en.urgent.passportBlocks;
    return template.replace('{name}', person.identity.name);
  }
  return top.entry.title;
}

// The unit after the number of days: "days late" past the date, "days left" before it.
export function topUnit(top: HomeTop): string {
  const days = top.entry.days;
  return days < 0
    ? plural(-days, en.year.daysLate.one, en.year.daysLate.other)
    : plural(days, en.year.daysLeft.one, en.year.daysLeft.other);
}

export interface TopItemProps {
  readonly top: HomeTop;
  readonly onOpen: () => void;
}

// The home stage's right side: one item and nothing else. A small label, the company dot and
// name, the title, the date and the days, and a quiet button to its card.
export function TopItem({ top, onOpen }: TopItemProps) {
  const entry = top.entry;
  const late = top.reason === 'overdue' || top.reason === 'blocked';
  return (
    <section
      className={cx(
        'topitem',
        late && 'topitem--late',
        top.reason === 'overdue' && 'topitem--overdue',
      )}
      aria-label={en.urgent.topLabel}
    >
      <span className="topitem__label">{labelOf(top.reason)}</span>
      <span
        className="topitem__company"
        style={{ '--company-colour': companyColour(entry.company) }}
      >
        <span className="topitem__dot" aria-hidden="true" />
        {entry.companyName}
      </span>
      <h2 className="topitem__title">{topTitle(top)}</h2>
      <p className="topitem__when">
        {formatShort(entry.date)}
        {' · '}
        <span className="topitem__days">
          {Math.abs(entry.days)} {topUnit(top)}
        </span>
      </p>
      <button type="button" className="topitem__open" onClick={onOpen}>
        {en.urgent.open}
      </button>
    </section>
  );
}
