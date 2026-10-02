import type { Card, IsoDate } from '@boasis/schema';
import { addDays, isOnOrAfter } from './calendar';
import { findRequirement } from './requirements';

// Spec 9: one schedule for every requirement, starting at that requirement's lead time: 90, 60, 30,
// 14, 7 and 1 days before, then daily when overdue. Short requirements use 7 and 1 only, which the
// lead time of 7 gives on its own.
export const REMINDER_LADDER: readonly number[] = [90, 60, 30, 14, 7, 1];
// Overdue reminders run daily; the schedule stops after this many days.
export const OVERDUE_DAYS = 30;
// Spec 9 escalation: at 30 days with no step ticked every owner is copied.
export const COPY_OWNERS_AT: readonly number[] = [30, 7];
// Spec 9 escalation: at 7 days, daily to the owners as well.
export const DAILY_TO_OWNERS_FROM = 7;

export interface ReminderFire {
  fireOn: IsoDate;
  // Days before the due date; 0 on the day, negative once overdue.
  offsetDays: number;
  // Spec 9: every owner is copied (30 and 7 days, no step ticked).
  copyOwners: boolean;
  // Spec 9: the daily reminder to the owners from 7 days.
  dailyToOwners: boolean;
  // Spec 9: overdue, daily to everyone involved.
  overdue: boolean;
}

// The dates a reminder fires for this card from today on. An empty list for a card with no
// date or a complete card. The lead time comes from the catalogue unless given (the decision
// point on a mainland LLC uses 180, spec 9).
export function reminderSchedule(card: Card, today: IsoDate, leadDays?: number): ReminderFire[] {
  const dueOn = card.dueOn;
  if (dueOn === null || card.state === 'complete') {
    return [];
  }
  const lead = leadDays ?? findRequirement(card.requirementId)?.defaultLeadDays ?? 90;
  const noStepTicked = !card.steps.some((step) => step.done);
  const fires = new Map<number, ReminderFire>();

  const put = (offsetDays: number, patch: Partial<ReminderFire>) => {
    const current = fires.get(offsetDays) ?? {
      fireOn: addDays(dueOn, -offsetDays),
      offsetDays,
      copyOwners: false,
      dailyToOwners: false,
      overdue: false,
    };
    fires.set(offsetDays, { ...current, ...patch });
  };

  const ladder = REMINDER_LADDER.filter((offset) => offset <= lead);
  if (!REMINDER_LADDER.includes(lead)) {
    // A lead time off the ladder (180) starts the schedule at the lead time itself.
    ladder.unshift(lead);
  }
  for (const offset of ladder) {
    put(offset, { copyOwners: noStepTicked && COPY_OWNERS_AT.includes(offset) });
  }
  if (lead >= DAILY_TO_OWNERS_FROM) {
    for (let offset = DAILY_TO_OWNERS_FROM; offset >= 1; offset -= 1) {
      put(offset, { dailyToOwners: true });
    }
  }
  for (let offset = -1; offset >= -OVERDUE_DAYS; offset -= 1) {
    put(offset, { overdue: true });
  }

  return [...fires.values()]
    .filter((fire) => isOnOrAfter(fire.fireOn, today))
    .sort((a, b) => b.offsetDays - a.offsetDays);
}
