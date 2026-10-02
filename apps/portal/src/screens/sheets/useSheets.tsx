import type { CompanyFacts } from '@boasis/schema';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CompanyView } from '../../data/bundles';
import type { Entry } from '../../lib/entries';
import { AnswersSheet } from './AnswersSheet';
import { ArchiveSheet } from './ArchiveSheet';
import { CompanySheet } from './CompanySheet';
import { DeadlineSheet } from './DeadlineSheet';
import { DeleteCompanySheet } from './DeleteCompanySheet';
import { EventSheet } from './EventSheet';
import { LicenceSheet } from './LicenceSheet';

// Lite's sheet state: null, or one panel. One overlay for every panel in the app.
export type SheetState =
  | { readonly kind: 'deadline'; readonly entry: Entry; readonly showCompany: boolean }
  | { readonly kind: 'company'; readonly facts: CompanyFacts | null; readonly typed?: boolean }
  | { readonly kind: 'licence'; readonly view: CompanyView }
  | { readonly kind: 'event'; readonly view: CompanyView }
  | { readonly kind: 'answers'; readonly view: CompanyView }
  | { readonly kind: 'archive'; readonly entries: readonly Entry[]; readonly showCompany: boolean }
  | { readonly kind: 'removeCompany'; readonly view: CompanyView };

export interface SheetHandlers {
  readonly onCompanySaved?: (saved: CompanyFacts, wasNew: boolean) => void;
  readonly onCompanyRemoved?: () => void;
}

// The panel stays mounted for a moment after closing so it can slide away, as lite's does.
const CLOSE_MS = 260;

export function useSheets(handlers: SheetHandlers = {}): {
  readonly open: (state: SheetState) => void;
  readonly close: () => void;
  readonly element: ReactNode;
} {
  const [state, setState] = useState<SheetState | null>(null);
  const [shown, setShown] = useState(false);
  const timer = useRef<number | null>(null);

  const open = useCallback((next: SheetState) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    setState(next);
    setShown(true);
  }, []);

  const close = useCallback(() => {
    setShown(false);
    timer.current = window.setTimeout(() => {
      setState(null);
      timer.current = null;
    }, CLOSE_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  let element: ReactNode = null;
  if (state !== null) {
    switch (state.kind) {
      case 'deadline':
        element = (
          <DeadlineSheet
            key={state.entry.id}
            open={shown}
            entry={state.entry}
            showCompany={state.showCompany}
            onClose={close}
          />
        );
        break;
      case 'company':
        element = (
          <CompanySheet
            key={state.facts?.id ?? 'new'}
            open={shown}
            facts={state.facts}
            typed={state.typed}
            onClose={close}
            onSaved={(saved) => {
              handlers.onCompanySaved?.(saved, state.facts === null);
            }}
          />
        );
        break;
      case 'licence':
        element = <LicenceSheet open={shown} bundle={state.view.bundle} onClose={close} />;
        break;
      case 'event':
        element = <EventSheet open={shown} bundle={state.view.bundle} onClose={close} />;
        break;
      case 'answers':
        element = <AnswersSheet open={shown} bundle={state.view.bundle} onClose={close} />;
        break;
      case 'archive':
        element = (
          <ArchiveSheet
            open={shown}
            entries={state.entries}
            showCompany={state.showCompany}
            onOpenEntry={(entry) => {
              open({ kind: 'deadline', entry, showCompany: state.showCompany });
            }}
            onClose={close}
          />
        );
        break;
      case 'removeCompany':
        element = (
          <DeleteCompanySheet
            open={shown}
            bundle={state.view.bundle}
            entries={state.view.entries}
            onClose={close}
            onDone={() => {
              close();
              handlers.onCompanyRemoved?.();
            }}
          />
        );
        break;
    }
  }

  return { open, close, element };
}
