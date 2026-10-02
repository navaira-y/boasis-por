import { useId, type KeyboardEvent } from 'react';
import { cx } from '../shared/cx';
import './Tabs.css';

export interface TabItem<V extends string> {
  readonly value: V;
  readonly label: string;
  // A small dot on the tab, for example when something in that tab needs attention.
  readonly dot?: boolean;
}

export interface TabsProps<V extends string> {
  readonly label: string;
  readonly items: readonly TabItem<V>[];
  readonly value: V;
  readonly onChange: (value: V) => void;
  readonly className?: string;
}

// A segmented control: one pill, one tab lit. Arrow keys move between tabs.
export function Tabs<V extends string>({ label, items, value, onChange, className }: TabsProps<V>) {
  const id = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex((item) => item.value === value);
    if (index === -1 || items.length === 0) {
      return;
    }
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (index + 1) % items.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    }
    const item = next === null ? undefined : items[next];
    if (item === undefined) {
      return;
    }
    event.preventDefault();
    onChange(item.value);
    const target = event.currentTarget.querySelector<HTMLButtonElement>(
      `[data-value="${item.value}"]`,
    );
    target?.focus();
  };

  return (
    <div className={cx('tabs', className)} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const on = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            id={`${id}-${item.value}`}
            data-value={item.value}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={cx('tabs__tab', on && 'tabs__tab--on')}
            onClick={() => {
              onChange(item.value);
            }}
          >
            {item.label}
            {item.dot === true ? <span className="tabs__dot" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}
