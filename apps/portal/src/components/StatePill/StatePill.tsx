import type { CardState } from '@boasis/schema';
import { cx } from '../shared/cx';
import { STATE_LABELS } from './state';
import './StatePill.css';

export interface StatePillProps {
  readonly state: CardState;
  readonly size?: 'sm' | 'md';
  readonly className?: string;
}

// A dot in the state's colour and its label, as the spec screenshots show on every card.
export function StatePill({ state, size = 'md', className }: StatePillProps) {
  return (
    <span className={cx('state-pill', `state-pill--${state}`, `state-pill--${size}`, className)}>
      <span className="state-pill__dot" aria-hidden="true" />
      <span className="state-pill__label">{STATE_LABELS[state]}</span>
    </span>
  );
}
