import { Button } from '../Button/Button';
import { cx } from '../shared/cx';
import './Empty.css';

export interface EmptyProps {
  readonly title: string;
  readonly line: string;
  readonly action?: { readonly label: string; readonly onSelect: () => void };
  readonly className?: string;
}

// An empty list says what would be here and, when there is one, offers the way to fill it.
export function Empty({ title, line, action, className }: EmptyProps) {
  return (
    <div className={cx('empty', className)} role="status">
      <p className="empty__title">{title}</p>
      <p className="empty__line">{line}</p>
      {action !== undefined ? (
        <Button variant="primary" size="sm" onClick={action.onSelect} className="empty__action">
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
