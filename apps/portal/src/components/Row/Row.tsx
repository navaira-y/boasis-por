import type { CardState } from '@boasis/schema';
import type { ReactNode } from 'react';
import { cx } from '../shared/cx';
import { ChevronIcon } from '../shared/icons';
import './Row.css';

export interface RowProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  // Trailing content: a value (and an optional second line) at the end of the row.
  readonly value?: ReactNode;
  readonly valueNote?: ReactNode;
  // An Avatar, CompanyMark or icon at the start.
  readonly leading?: ReactNode;
  // Colours the trailing figure as lite does: sand when the date is close, rose when it has
  // passed. Give the card's state, or the days left the screen already computed; a state wins.
  readonly state?: CardState;
  readonly daysLeft?: number;
  // Tappable rows show a chevron and become a button.
  readonly onSelect?: () => void;
  readonly chevron?: boolean;
  readonly className?: string;
}

// One item in a list: leading mark, title over subtitle, value or chevron at the end. A button
// when it can be opened, a plain div when it only reports.
export function Row({
  title,
  subtitle,
  value,
  valueNote,
  leading,
  state,
  daysLeft,
  onSelect,
  chevron = onSelect !== undefined,
  className,
}: RowProps) {
  const tone = toneOf(state, daysLeft);
  const body = (
    <>
      {leading !== undefined ? <span className="row__leading">{leading}</span> : null}
      <span className="row__text">
        <span className="row__title">{title}</span>
        {subtitle !== undefined ? <span className="row__subtitle">{subtitle}</span> : null}
      </span>
      {value !== undefined ? (
        <span className="row__value">
          <span className="row__value-main">{value}</span>
          {valueNote !== undefined ? <span className="row__value-note">{valueNote}</span> : null}
        </span>
      ) : null}
      {chevron ? <ChevronIcon className="row__chevron" /> : null}
    </>
  );
  if (onSelect !== undefined) {
    return (
      <button
        type="button"
        className={cx('row', 'row--tappable', tone, className)}
        onClick={onSelect}
      >
        {body}
      </button>
    );
  }
  return <div className={cx('row', tone, className)}>{body}</div>;
}

// Display only, mirroring spec 7.1: a passed date is late, under 30 days is soon. The state,
// when the screen has it from packages/rules, takes precedence over the number.
function toneOf(state: CardState | undefined, daysLeft: number | undefined): string | null {
  if (state !== undefined) {
    if (state === 'overdue') {
      return 'row--late';
    }
    if (state === 'expiring' || state === 'action-soon') {
      return 'row--soon';
    }
    return null;
  }
  if (daysLeft === undefined) {
    return null;
  }
  if (daysLeft < 0) {
    return 'row--late';
  }
  return daysLeft < 30 ? 'row--soon' : null;
}
