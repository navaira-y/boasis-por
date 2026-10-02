import { storage } from './storage';

// Lite's theme.js, ported. "system" is the default: an attribute is pinned only when the person
// picks a side, so the system preference wins until then (tokens.css handles both).
export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'boasis.theme';

export function readTheme(): ThemeChoice {
  const stored = storage.read(KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', choice);
  }
  storage.write(KEY, choice);
  paintChrome();
}

// The colour the page announces to the browser: on a phone it paints the status bar. Read from
// what the page already paints, so no table has to be kept in step with the theme.
export function paintChrome(): void {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta === null) {
    return;
  }
  const page = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  meta.setAttribute('content', page === '' ? '#F6F8FB' : page);
}
