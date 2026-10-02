import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { PHONE_QUERY, useMediaQuery } from './useMediaQuery';

export type Layout = 'phone' | 'desktop';

export interface LayerContextValue {
  // Where sheets and menus are portalled. Null means document.body. A preview frame that wants
  // overlays inside its own box passes its element here and sets contain: paint on it.
  readonly container: HTMLElement | null;
  // A forced layout, or null to follow the viewport width.
  readonly layout: Layout | null;
}

const LayerContext = createContext<LayerContextValue>({ container: null, layout: null });

export function LayerProvider({
  container,
  layout,
  children,
}: {
  container: HTMLElement | null;
  layout: Layout | null;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ container, layout }), [container, layout]);
  return <LayerContext.Provider value={value}>{children}</LayerContext.Provider>;
}

export function useLayerContainer(): HTMLElement | null {
  return useContext(LayerContext).container;
}

// Phone or desktop: the provider's override first, else the viewport width.
export function useLayout(): Layout {
  const forced = useContext(LayerContext).layout;
  const phone = useMediaQuery(PHONE_QUERY);
  if (forced !== null) {
    return forced;
  }
  return phone ? 'phone' : 'desktop';
}
