import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { storage } from './storage';

// Reminder settings (spec 9, screen 16): the channels this person wants and the quiet hours.
// No entity in packages/schema carries them yet, so they live in storage per device.
const KEY = 'boasis.portal.reminders';

export const ReminderSettings = z.object({
  email: z.boolean(),
  push: z.boolean(),
  // Quiet hours as whole hours, 0 to 23; nothing fires between them.
  quietFrom: z.number().int().min(0).max(23),
  quietTo: z.number().int().min(0).max(23),
});
export type ReminderSettings = z.infer<typeof ReminderSettings>;

export const DEFAULT_SETTINGS: ReminderSettings = {
  email: true,
  push: false,
  quietFrom: 22,
  quietTo: 8,
};

const listeners = new Set<() => void>();
let cached: ReminderSettings | undefined;

export function readSettings(): ReminderSettings {
  if (cached !== undefined) {
    return cached;
  }
  const raw = storage.read(KEY);
  if (raw !== null) {
    try {
      const parsed = ReminderSettings.safeParse(JSON.parse(raw));
      if (parsed.success) {
        cached = parsed.data;
        return cached;
      }
    } catch {
      // A value that does not parse is ignored; the defaults apply.
    }
  }
  cached = DEFAULT_SETTINGS;
  return cached;
}

export function writeSettings(patch: Partial<ReminderSettings>): ReminderSettings {
  const next = { ...readSettings(), ...patch };
  cached = next;
  storage.write(KEY, JSON.stringify(next));
  for (const listener of listeners) {
    listener();
  }
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSettings(): ReminderSettings {
  return useSyncExternalStore(subscribe, readSettings, () => DEFAULT_SETTINGS);
}
