import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { storage } from './storage';
import { today } from './today';

// The signed-in person, kept in storage rather than a cookie (rule 12). The mock accepts any
// email and password (spec 14 screen 1 is email and password with reset). The profile fields
// are lite's account page: first and last name, mobile, time zone, where reminders go.
const SESSION_KEY = 'boasis.portal.session';

export const Session = z.object({
  email: z.string().min(1),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  timeZone: z.string(),
  notificationEmail: z.string(),
  // Security and passwords (screen 18): kept on the mock session, per device, until a backend
  // holds them. Absent in an older stored session reads as never changed, off, and unknown.
  passwordChangedOn: z.string().nullable().default(null),
  twoStepOn: z.boolean().default(false),
  signedInOn: z.string().nullable().default(null),
  // The demo "acting as" value: the id of an access grant the demo is viewed as, or null for the
  // owner herself. Absent in an older stored session reads as the owner.
  actingAs: z.string().nullable().default(null),
});
export type Session = z.infer<typeof Session>;

const listeners = new Set<() => void>();
let cached: Session | null | undefined;

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function readSession(): Session | null {
  if (cached !== undefined) {
    return cached;
  }
  const raw = storage.read(SESSION_KEY);
  if (raw === null) {
    cached = null;
    return null;
  }
  try {
    const parsed = Session.safeParse(JSON.parse(raw));
    cached = parsed.success ? parsed.data : null;
  } catch {
    cached = null;
  }
  return cached;
}

export function writeSession(session: Session | null): void {
  cached = session;
  if (session === null) {
    storage.remove(SESSION_KEY);
  } else {
    storage.write(SESSION_KEY, JSON.stringify(session));
  }
  notify();
}

// Lite's initials: one letter from each half of the name, else the email while the name is empty.
export function initialsOf(session: Session): string {
  const first = session.firstName.trim();
  const last = session.lastName.trim();
  if (first !== '' && last !== '') {
    return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
  }
  if (first !== '') {
    return first.slice(0, 2).toUpperCase();
  }
  if (last !== '') {
    return last.slice(0, 2).toUpperCase();
  }
  return session.email.slice(0, 2).toUpperCase();
}

export function displayName(session: Session): string {
  const name = `${session.firstName} ${session.lastName}`.trim();
  return name === '' ? (session.email.split('@')[0] ?? session.email) : name;
}

// Sign in: any email and password. The name comes from the sign-up form when there is one.
export function signIn(email: string, names?: { firstName: string; lastName: string }): Session {
  const existing = readSession();
  const session: Session = {
    email: email.trim(),
    firstName: names?.firstName.trim() ?? existing?.firstName ?? '',
    lastName: names?.lastName.trim() ?? existing?.lastName ?? '',
    phone: existing?.phone ?? '',
    timeZone: existing?.timeZone ?? 'Asia/Dubai',
    notificationEmail: existing?.notificationEmail ?? '',
    passwordChangedOn: existing?.passwordChangedOn ?? null,
    twoStepOn: existing?.twoStepOn ?? false,
    signedInOn: today(),
    actingAs: null,
  };
  writeSession(session);
  return session;
}

export function signOut(): void {
  writeSession(null);
}

export function updateSession(patch: Partial<Session>): Session | null {
  const current = readSession();
  if (current === null) {
    return null;
  }
  const next = { ...current, ...patch };
  writeSession(next);
  return next;
}

// Switch the demo to view as a member's grant, or back to the owner with null.
export function setActingAs(grantId: string | null): Session | null {
  return updateSession({ actingAs: grantId });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, readSession, () => null);
}

// The owner's name as the history and the audit trail write it.
export function ownerNameOf(session: Session | null): string {
  return session === null ? 'Owner' : displayName(session);
}
