import { COMPANY_COLOURS, colourVar } from '../../lib/companyColours';
import { stableHash } from '../shared/hash';
import { cx } from '../shared/cx';
import { initialsOf, type AvatarSize } from '../Avatar/Avatar';
import './CompanyMark.css';

export interface CompanyMarkProps {
  readonly name: string;
  readonly id?: string;
  readonly size?: AvatarSize;
  readonly className?: string;
}

// A company's mark: its initials in a colour of the company palette (--company-N).
// Round where a person's avatar is square, so the two never read as one thing.
export function CompanyMark({ name, id, size = 'md', className }: CompanyMarkProps) {
  const slot = stableHash(id ?? name) % COMPANY_COLOURS.length;
  return (
    <span
      className={cx('company-mark', `company-mark--${size}`, className)}
      style={{ '--company-colour': colourVar(slot) }}
      title={name}
      aria-hidden="true"
      data-slot={slot}
    >
      {initialsOf(name)}
    </span>
  );
}
