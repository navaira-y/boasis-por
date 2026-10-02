// The one adapter around window.localStorage (rule 12: no browser-only API without an adapter).
// Every read and write is wrapped: private mode, a full quota or a missing window all read as
// "nothing stored" rather than throwing into a screen.
export interface KeyValueStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export const storage: KeyValueStorage = {
  read(key) {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable; the value then lives in memory for the session only.
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to remove when storage is unavailable.
    }
  },
};
