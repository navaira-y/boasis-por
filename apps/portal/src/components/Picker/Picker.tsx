import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ControlSize } from '../Button/Button';
import { Sheet } from '../Sheet/Sheet';
import { cx } from '../shared/cx';
import { CheckIcon, ChevronIcon } from '../shared/icons';
import { useLayerContainer, useLayout } from '../shared/LayerProvider';
import { placeMenu } from './place';
import './Picker.css';

export interface PickerOption<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly note?: string;
}

export interface PickerProps<V extends string> {
  // Names the control. A Field's label points here through htmlFor; the button also carries it.
  readonly label: string;
  readonly value: V | null;
  readonly options: readonly PickerOption<V>[];
  readonly onChange: (value: V) => void;
  readonly id?: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly size?: ControlSize;
  readonly className?: string;
}

const MENU_GAP = 6;
const MENU_MARGIN = 12;

function readToken(name: string, fallback: number): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// A select that looks like the rest of the app. On a desktop the list is a menu anchored to the
// button, drawn in a portal so no scrolling box can clip it, flipped above when there is no
// room below, closed by Escape or a tap anywhere else without touching the sheet that holds
// it. On a phone the list opens inside a Sheet of its own.
export function Picker<V extends string>({
  label,
  value,
  options,
  onChange,
  id,
  placeholder = 'Choose',
  disabled = false,
  size = 'md',
  className,
}: PickerProps<V>) {
  const generated = useId();
  const controlId = id ?? generated;
  const listId = `${controlId}-list`;
  const layout = useLayout();
  const container = useLayerContainer();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const current = options.find((option) => option.value === value);
  const empty = options.length === 0;

  const openMenu = () => {
    if (disabled || empty) {
      return;
    }
    const index = options.findIndex((option) => option.value === value);
    setActive(index === -1 ? 0 : index);
    setOpen(true);
  };

  const closeMenu = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      button.current?.focus({ preventScroll: true });
    }
  };

  const pick = (next: V) => {
    closeMenu(true);
    if (next !== value) {
      onChange(next);
    }
  };

  const anchored = open && layout === 'desktop';

  // Place the menu before it paints and again whenever anything scrolls or the window resizes.
  // The style is written straight to the node: no state, no second render, no jump.
  useLayoutEffect(() => {
    if (!anchored) {
      return undefined;
    }
    const place = () => {
      const anchorNode = button.current;
      const menuNode = menu.current;
      if (anchorNode === null || menuNode === null) {
        return;
      }
      const origin = container?.getBoundingClientRect() ?? null;
      const bounds =
        origin === null
          ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight }
          : { top: origin.top, left: origin.left, width: origin.width, height: origin.height };
      const rect = anchorNode.getBoundingClientRect();
      menuNode.style.maxHeight = '';
      menuNode.style.width = '';
      const placement = placeMenu({
        anchor: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        menu: { width: menuNode.offsetWidth, height: menuNode.offsetHeight },
        bounds,
        gap: MENU_GAP,
        margin: MENU_MARGIN,
        maxWidth: readToken('--menu-max-inline', 420),
      });
      // Inside a frame that contains its fixed descendants, positions are relative to the frame.
      const offsetTop = origin === null ? 0 : origin.top;
      const offsetLeft = origin === null ? 0 : origin.left;
      menuNode.style.top = `${String(placement.top - offsetTop)}px`;
      menuNode.style.left = `${String(placement.left - offsetLeft)}px`;
      menuNode.style.width = `${String(placement.width)}px`;
      menuNode.style.maxHeight = `${String(placement.maxHeight)}px`;
      menuNode.dataset.side = placement.side;
      menuNode.style.visibility = 'visible';
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchored, container, options.length]);

  // The open list takes the keyboard; the active option scrolls into view.
  useEffect(() => {
    if (!anchored) {
      return;
    }
    menu.current?.focus({ preventScroll: true });
  }, [anchored]);

  useEffect(() => {
    if (!anchored) {
      return;
    }
    const node = menu.current?.querySelector<HTMLElement>(`[data-index="${String(active)}"]`);
    node?.scrollIntoView({ block: 'nearest' });
  }, [anchored, active]);

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open) {
      return;
    }
    if (
      event.key === 'ArrowDown' ||
      event.key === 'ArrowUp' ||
      event.key === 'Enter' ||
      event.key === ' '
    ) {
      event.preventDefault();
      openMenu();
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const count = options.length;
    if (count === 0) {
      return;
    }
    switch (event.key) {
      case 'Escape':
        // Ours to handle, and ours only: a sheet around this picker must stay open.
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        return;
      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
        return;
      case 'ArrowDown':
        event.preventDefault();
        setActive((index) => (index + 1) % count);
        return;
      case 'ArrowUp':
        event.preventDefault();
        setActive((index) => (index - 1 + count) % count);
        return;
      case 'Home':
        event.preventDefault();
        setActive(0);
        return;
      case 'End':
        event.preventDefault();
        setActive(count - 1);
        return;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const option = options[active];
        if (option !== undefined) {
          pick(option.value);
        }
        return;
      }
      default:
        return;
    }
  };

  const optionRows = (asSheet: boolean) =>
    options.map((option, index) => {
      const selected = option.value === value;
      return (
        <li
          key={option.value}
          id={`${listId}-${option.value}`}
          role="option"
          aria-selected={selected}
          data-index={index}
          className={cx(
            'picker__option',
            selected && 'picker__option--selected',
            !asSheet && index === active && 'picker__option--active',
          )}
          onPointerEnter={
            asSheet
              ? undefined
              : () => {
                  setActive(index);
                }
          }
          onClick={() => {
            pick(option.value);
          }}
        >
          <span className="picker__option-text">
            <span className="picker__option-label">{option.label}</span>
            {option.note !== undefined ? (
              <span className="picker__option-note">{option.note}</span>
            ) : null}
          </span>
          {selected ? <CheckIcon className="picker__check" /> : null}
        </li>
      );
    });

  const activeOption = options[active];

  return (
    <>
      <button
        ref={button}
        id={controlId}
        type="button"
        className={cx('picker', `picker--${size}`, open && 'picker--open', className)}
        disabled={disabled || empty}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={anchored ? listId : undefined}
        aria-label={label}
        onClick={() => {
          if (open) {
            closeMenu(true);
          } else {
            openMenu();
          }
        }}
        onKeyDown={onButtonKeyDown}
      >
        <span
          className={cx('picker__value', current === undefined && 'picker__value--placeholder')}
        >
          {empty ? 'No options' : (current?.label ?? placeholder)}
        </span>
        {current?.note !== undefined ? <span className="picker__note">{current.note}</span> : null}
        <ChevronIcon className="picker__chevron" />
      </button>

      {anchored
        ? createPortal(
            <div className="picker-layer">
              <div
                className="picker__backdrop"
                onPointerDown={(event) => {
                  event.preventDefault();
                  closeMenu(false);
                }}
              />
              <ul
                ref={menu}
                id={listId}
                className="picker__menu"
                role="listbox"
                tabIndex={-1}
                aria-label={label}
                aria-activedescendant={
                  activeOption === undefined ? undefined : `${listId}-${activeOption.value}`
                }
                onKeyDown={onMenuKeyDown}
              >
                {optionRows(false)}
              </ul>
            </div>,
            container ?? document.body,
          )
        : null}

      {layout === 'phone' ? (
        <Sheet
          open={open}
          title={label}
          onClose={() => {
            closeMenu(true);
          }}
        >
          <ul className="picker__list" role="listbox" aria-label={label}>
            {optionRows(true)}
          </ul>
        </Sheet>
      ) : null}
    </>
  );
}
