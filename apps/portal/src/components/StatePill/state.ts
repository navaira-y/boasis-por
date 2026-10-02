import type { CardState } from '@boasis/schema';

// Spec 7.1: the label of each state on a card, and its severity when several apply. Display
// only. Which state a card is in comes from packages/rules; this orders and names what it gets.
export const STATE_LABELS: Readonly<Record<CardState, string>> = {
  complete: 'Complete',
  'on-track': 'On track',
  'action-soon': 'Action soon',
  expiring: 'Expiring',
  overdue: 'Overdue',
  unknown: 'Unknown',
  'decision-needed': 'Decision needed',
};

// Most severe first, as spec 7.1 lists them.
export const STATE_SEVERITY: readonly CardState[] = [
  'overdue',
  'expiring',
  'action-soon',
  'decision-needed',
  'unknown',
  'on-track',
  'complete',
];

export function severityOf(state: CardState): number {
  return STATE_SEVERITY.indexOf(state);
}

// The state to show when a card carries several, or null for none.
export function mostSevere(states: readonly CardState[]): CardState | null {
  let worst: CardState | null = null;
  for (const state of states) {
    if (worst === null || severityOf(state) < severityOf(worst)) {
      worst = state;
    }
  }
  return worst;
}

// Sorts a copy, most severe first, stable within a state.
export function sortBySeverity<T>(items: readonly T[], stateOf: (item: T) => CardState): T[] {
  return items
    .map((item, index) => ({ item, index, rank: severityOf(stateOf(item)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

// The states the spec calls red: the attention banner counts these.
export function isRed(state: CardState): boolean {
  return state === 'overdue';
}
