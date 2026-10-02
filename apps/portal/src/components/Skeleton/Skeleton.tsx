import { cx } from '../shared/cx';
import './Skeleton.css';

export interface SkeletonProps {
  // A line of text, a round mark, or a whole card.
  readonly shape?: 'line' | 'circle' | 'card';
  // Inline size as a CSS length or percentage; lines default to full width.
  readonly inlineSize?: string;
  readonly className?: string;
}

// A loading placeholder in the shape of what is coming. Announces nothing on its own: the
// screen that shows it keeps a role="status" line for readers.
export function Skeleton({ shape = 'line', inlineSize, className }: SkeletonProps) {
  return (
    <span
      className={cx('skeleton', `skeleton--${shape}`, className)}
      style={inlineSize !== undefined ? { inlineSize } : undefined}
      aria-hidden="true"
    />
  );
}
