import type { AlertKind } from './alerts';

// The single most important item, shown both in the dial hub and in the block beside the dial,
// so the two never disagree. Pure: it reads the entries and alerts the screen already has, and
// the days packages/rules worked out.
//
// First match wins:
//   1. overdue: the most overdue date;
//   2. blocked: a renewal that cannot proceed (a passport too short, no health insurance) and is
//      due within thirty days;
//   3. soon: the nearest date due within fifteen days;
//   4. next: otherwise the next date due (a blocked renewal further out falls here by its date).
export type TopReason = 'overdue' | 'blocked' | 'soon' | 'next';

// Due within this many days counts as soon (the CTO's figure, also the home's Approaching group).
export const SOON_DAYS = 15;
// A blocked renewal due within this many days is urgent.
export const BLOCKED_DAYS = 30;

export interface TopDated {
  readonly id: string;
  readonly date: string;
  readonly days: number;
  readonly status: 'upcoming' | 'done';
}

export interface TopBlocker<E extends TopDated> {
  readonly kind: AlertKind;
  // The renewal the alert blocks, when it has a card.
  readonly entry: E | null;
}

export interface TopItem<E extends TopDated, A extends TopBlocker<E>> {
  readonly reason: TopReason;
  readonly entry: E;
  // The blocker, for reason 'blocked'.
  readonly alert: A | null;
}

function soonestFirst(a: TopDated, b: TopDated): number {
  if (a.days !== b.days) {
    return a.days - b.days;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function topItem<E extends TopDated, A extends TopBlocker<E>>(
  entries: readonly E[],
  alerts: readonly A[],
): TopItem<E, A> | null {
  const open = entries.filter((entry) => entry.status === 'upcoming').sort(soonestFirst);

  // 1. The most overdue: the most negative days, which sorting puts first.
  const overdue = open.find((entry) => entry.days < 0);
  if (overdue !== undefined) {
    return { reason: 'overdue', entry: overdue, alert: null };
  }

  // 2. A blocked renewal due within thirty days, the soonest first.
  const blocked = alerts
    .flatMap((alert) =>
      alert.kind !== 'overdue' &&
      alert.entry !== null &&
      alert.entry.status === 'upcoming' &&
      alert.entry.days <= BLOCKED_DAYS
        ? [{ entry: alert.entry, alert }]
        : [],
    )
    .sort((one, other) => soonestFirst(one.entry, other.entry))[0];
  if (blocked !== undefined) {
    return { reason: 'blocked', entry: blocked.entry, alert: blocked.alert };
  }

  const next = open[0];
  if (next === undefined) {
    return null;
  }
  // 3 and 4. Nothing is late, so the first open entry is the nearest one.
  return { reason: next.days <= SOON_DAYS ? 'soon' : 'next', entry: next, alert: null };
}
