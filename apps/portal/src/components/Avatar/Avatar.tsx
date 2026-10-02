import { colourSlot } from '../shared/hash';
import { cx } from '../shared/cx';
import './Avatar.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  readonly name: string;
  // The stable key the colour is derived from; the name when there is no id.
  readonly id?: string;
  readonly size?: AvatarSize;
  readonly className?: string;
}

// Two letters from a name: the first letters of the first two words, else the first two letters.
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '');
  const first = words[0];
  if (first === undefined) {
    return '?';
  }
  const second = words[1];
  if (second !== undefined) {
    return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase();
  }
  return first.slice(0, 2).toUpperCase();
}

// Someone's initials in a colour that is theirs: the slot comes from a stable hash of the id, so
// the same person is the same colour on every device without a setting.
export function Avatar({ name, id, size = 'md', className }: AvatarProps) {
  const slot = colourSlot(id ?? name);
  return (
    <span
      className={cx('avatar', `avatar--${size}`, className)}
      style={{ '--avatar-colour': `var(--avatar-${String(slot)})` }}
      title={name}
      aria-hidden="true"
      data-slot={slot}
    >
      {initialsOf(name)}
    </span>
  );
}
