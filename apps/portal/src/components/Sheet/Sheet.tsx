import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../shared/cx';
import { CloseIcon } from '../shared/icons';
import { useLayerContainer, useLayout } from '../shared/LayerProvider';
import './Sheet.css';

export interface SheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  // A small capital line above the title, as lite writes it: the company and the state.
  readonly kicker?: string;
  // A short line under the title, for example what this panel changes.
  readonly subtitle?: string;
  readonly footer?: ReactNode;
  readonly className?: string;
  readonly children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.offsetParent !== null || element === document.activeElement,
  );
}

// Lite's one overlay for every panel, ported: a centred card on a desktop, a sheet that slides
// up on a phone. The veil and the panel stay mounted and transition in and out on the "on"
// class, as lite does; the contents exist only while open. Closing lives here once: the cross
// in the corner, Escape, and a tap on the veil. Escape is handled on the panel and stopped
// there, so a panel inside a panel closes one layer at a time and a picker's own Escape never
// reaches the sheet that holds it (audit 2.1e). Focus is trapped and restored (audit 4.2).
export function Sheet({
  open,
  title,
  onClose,
  kicker,
  subtitle,
  footer,
  className,
  children,
}: SheetProps) {
  const container = useLayerContainer();
  const layout = useLayout();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Focus moves in on open and back to where it was on close.
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = panel.current;
    if (node !== null) {
      const first = focusables(node).find((element) => !element.classList.contains('sheet__close'));
      (first ?? node).focus({ preventScroll: true });
    }
    return () => {
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const node = panel.current;
    // A key pressed inside a nested overlay bubbles here through React, not the DOM. Ignore it.
    if (!open || node === null || !(event.target instanceof Node) || !node.contains(event.target)) {
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      const items = focusables(node);
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  return createPortal(
    <div
      className={cx('sheet-layer', `sheet-layer--${layout}`, open && 'sheet-layer--on', className)}
      aria-hidden={open ? undefined : true}
    >
      <div className="sheet__veil" onClick={open ? onClose : undefined} aria-hidden="true" />
      <div
        ref={panel}
        className="sheet"
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-labelledby={open ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        {open ? (
          <>
            <header className="sheet__header">
              {layout === 'phone' ? <span className="sheet__handle" aria-hidden="true" /> : null}
              <div className="sheet__heading">
                {kicker !== undefined ? <p className="sheet__kicker">{kicker}</p> : null}
                <h2 className="sheet__title" id={titleId}>
                  {title}
                </h2>
                {subtitle !== undefined ? <p className="sheet__subtitle">{subtitle}</p> : null}
              </div>
              <button type="button" className="sheet__close" onClick={onClose} aria-label="Close">
                <CloseIcon />
              </button>
            </header>
            <div className="sheet__body">{children}</div>
            {footer !== undefined ? <footer className="sheet__footer">{footer}</footer> : null}
          </>
        ) : null}
      </div>
    </div>,
    container ?? document.body,
  );
}
