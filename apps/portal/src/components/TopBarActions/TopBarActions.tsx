import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from '../Button/Button';
import { cx } from '../shared/cx';
import './TopBarActions.css';

export interface TopBarAction {
  readonly id: string;
  readonly label: string;
  readonly onSelect: () => void;
  readonly icon?: ReactNode;
  // The one action a screen leads with; the rest stay quiet.
  readonly primary?: boolean;
  readonly disabled?: boolean;
}

export interface TopBarActionsProps {
  readonly actions: readonly TopBarAction[];
  readonly className?: string;
}

// The actions a screen places at the end of its top bar or page header: quiet buttons, one of
// them primary at most, all the same height, laid out in one line that never wraps.
export function TopBarActions({ actions, className }: TopBarActionsProps) {
  if (actions.length === 0) {
    return null;
  }
  return (
    <div className={cx('top-bar-actions', className)}>
      {actions.map((action) => {
        const variant: ButtonVariant = action.primary === true ? 'primary' : 'quiet';
        return (
          <Button
            key={action.id}
            variant={variant}
            size="sm"
            icon={action.icon}
            disabled={action.disabled}
            onClick={action.onSelect}
          >
            {action.label}
          </Button>
        );
      })}
    </div>
  );
}
