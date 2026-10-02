import { COMPANY_COLOURS, colourVar } from '../../lib/companyColours';
import { cx } from '../shared/cx';
import './Swatches.css';

export interface SwatchesProps {
  readonly label: string;
  // The palette key chosen.
  readonly value: number;
  readonly onChange: (slot: number) => void;
  readonly className?: string;
}

// The company palette as swatches, one radio each: the only way a company colour is chosen, so
// no one can pick a colour outside the palette.
export function Swatches({ label, value, onChange, className }: SwatchesProps) {
  return (
    <div className={cx('swatches', className)} role="radiogroup" aria-label={label}>
      {COMPANY_COLOURS.map((colour, slot) => (
        <button
          key={colour.name}
          type="button"
          role="radio"
          aria-checked={value === slot}
          aria-label={colour.name}
          title={colour.name}
          className={cx('swatch', value === slot && 'swatch--on')}
          style={{ '--company-colour': colourVar(slot) }}
          onClick={() => {
            onChange(slot);
          }}
        />
      ))}
    </div>
  );
}
