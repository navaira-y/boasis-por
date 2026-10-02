import type { CardState } from '@boasis/schema';
import type { ReactNode } from 'react';
import { StatePill } from '../StatePill/StatePill';
import { cx } from '../shared/cx';
import { PlaceholderIcon } from '../shared/icons';
import './ComplianceCard.css';

export interface ComplianceCardProps {
  readonly title: string;
  // One line: what the card watches or the next date, already worded by the screen.
  readonly line: string;
  readonly state: CardState;
  // Replaces the placeholder glyph when a real icon exists.
  readonly icon?: ReactNode;
  readonly onSelect?: () => void;
  readonly className?: string;
}

// The card of spec 7.2: icon at the top start, the state at the top end, then the title and one
// line. Tapping opens the card page.
export function ComplianceCard({
  title,
  line,
  state,
  icon,
  onSelect,
  className,
}: ComplianceCardProps) {
  const body = (
    <>
      <span className="compliance-card__top">
        <span className="compliance-card__icon">{icon ?? <PlaceholderIcon />}</span>
        <StatePill state={state} size="sm" />
      </span>
      <span className="compliance-card__title">{title}</span>
      <span className="compliance-card__line">{line}</span>
    </>
  );
  if (onSelect !== undefined) {
    return (
      <button
        type="button"
        className={cx(
          'compliance-card',
          'compliance-card--tappable',
          `compliance-card--${state}`,
          className,
        )}
        onClick={onSelect}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cx('compliance-card', `compliance-card--${state}`, className)}>{body}</div>
  );
}
