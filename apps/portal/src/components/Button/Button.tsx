import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../shared/cx';
import { SpinnerIcon } from '../shared/icons';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ControlSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  readonly variant?: ButtonVariant;
  readonly size?: ControlSize;
  // Shows a spinner and blocks clicks; the label stays so the button keeps its width.
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const blocked = disabled === true || loading;
  return (
    <button
      {...rest}
      type={type}
      className={cx(
        'button',
        `button--${variant}`,
        `button--${size}`,
        loading && 'button--loading',
        className,
      )}
      disabled={blocked}
      aria-busy={loading || undefined}
    >
      {loading ? <SpinnerIcon className="button__spinner" /> : null}
      {icon !== undefined && !loading ? <span className="button__icon">{icon}</span> : null}
      <span className="button__label">{children}</span>
    </button>
  );
}
