import { cx } from '../shared/cx';
import { BellIcon, ChevronIcon } from '../shared/icons';
import './Urgent.css';

export interface UrgentProps {
  // The number of red items, counted by the screen from its cards.
  readonly count: number;
  // One line under the head, worded by the screen, for example the first item's title.
  readonly line: string;
  readonly onSelect: () => void;
  readonly className?: string;
}

// The attention banner, in the shape of lite's card: a head with the bell and the count, then
// one line. The whole card opens the list. Renders nothing when the count is zero, so a card
// that says "all fine" never becomes furniture.
export function Urgent({ count, line, onSelect, className }: UrgentProps) {
  if (count <= 0) {
    return null;
  }
  const total = count === 1 ? '1 item' : `${String(count)} items`;
  return (
    <button type="button" className={cx('urgent', className)} onClick={onSelect}>
      <span className="urgent__head">
        <span className="urgent__icon">
          <BellIcon width="var(--icon-sm)" height="var(--icon-sm)" />
        </span>
        <span className="urgent__title">Needs attention</span>
        <span className="urgent__count">{total}</span>
      </span>
      <span className="urgent__item">
        <span className="urgent__dot" aria-hidden="true" />
        <span className="urgent__line">{line}</span>
        <ChevronIcon className="urgent__chevron" width="var(--icon-sm)" height="var(--icon-sm)" />
      </span>
    </button>
  );
}
