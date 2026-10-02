import type { CardState, IsoDate } from '@boasis/schema';
import { daysUntil } from './calendar';

// Spec 7.1: when more than one state applies, the card shows the most severe, in this order.
export const STATE_PRECEDENCE: readonly CardState[] = [
  'overdue',
  'expiring',
  'action-soon',
  'decision-needed',
  'unknown',
  'on-track',
  'complete',
];

export function severity(state: CardState): number {
  return STATE_PRECEDENCE.indexOf(state);
}

// The most severe of several states; "complete" when the list is empty.
export function mostSevere(states: readonly CardState[]): CardState {
  let best: CardState = 'complete';
  for (const state of states) {
    if (severity(state) < severity(best)) {
      best = state;
    }
  }
  return best;
}

// Spec 7.1: expiring is under 30 days, on track is more than 90 days away.
export const EXPIRING_DAYS = 30;
export const ON_TRACK_DAYS = 90;

export interface StateInput {
  dueOn: IsoDate | null;
  today: IsoDate;
  leadDays: number;
  // Spec 7.3: closed by ticking the last step with its evidence.
  complete?: boolean;
  // Spec 7.1 Action soon: a prerequisite is missing.
  prerequisiteMissing?: boolean;
  // Spec 7.1 Unknown: the portal does not have the data to judge.
  unknown?: boolean;
  // Spec 7.1 and 10: the licence card while the decision point is open.
  decisionNeeded?: boolean;
  // A requirement with no date of its own that is still to be done (a day-0 item, an exit step). It
  // is treated as spec 7.1's "prerequisite missing": something is outstanding, so action soon.
  pending?: boolean;
  // A deadline that has passed on a date the portal does not know (a company incorporated before
  // corporate tax registration timelines began: every such deadline fell in 2024). Overdue.
  late?: boolean;
}

// Spec 7.1, the state table with its precedence. A complete card is complete; every other
// candidate that applies is collected and the most severe wins.
export function stateFor(input: StateInput): CardState {
  if (input.complete === true) {
    return 'complete';
  }
  const states: CardState[] = [];
  if (input.dueOn !== null) {
    const days = daysUntil(input.dueOn, input.today);
    if (days < 0) {
      states.push('overdue');
    } else if (days < EXPIRING_DAYS) {
      states.push('expiring');
    } else if (days <= input.leadDays) {
      states.push('action-soon');
    } else if (days > ON_TRACK_DAYS) {
      states.push('on-track');
    }
  }
  if (input.late === true) {
    states.push('overdue');
  }
  if (input.prerequisiteMissing === true || input.pending === true) {
    states.push('action-soon');
  }
  if (input.decisionNeeded === true) {
    states.push('decision-needed');
  }
  if (input.unknown === true) {
    states.push('unknown');
  }
  if (states.length === 0) {
    // A date between the lead time and 90 days with nothing outstanding: nothing to do yet.
    return 'on-track';
  }
  return mostSevere(states);
}
