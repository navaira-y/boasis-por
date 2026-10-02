import { useSyncExternalStore } from 'react';

// The one adapter around window.matchMedia (rule 12: no browser-only API without an adapter).
// Server or test environments with no window report false.
function subscribe(query: string, onChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const list = window.matchMedia(query);
  list.addEventListener('change', onChange);
  return () => {
    list.removeEventListener('change', onChange);
  };
}

function read(query: string): boolean {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribe(query, onChange),
    () => read(query),
    () => false,
  );
}

export const PHONE_QUERY = '(max-width: 820px)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
