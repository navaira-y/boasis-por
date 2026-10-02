import { actByDate, findRequirement, stateFor } from '@boasis/rules';
import type { Card, IsoDate } from '@boasis/schema';

// Spec 7.3: closing a recurring card stores its next occurrence (packages/rules nextOccurrence)
// under a new id. computeCards derives cards from the facts and cannot see that stored row
// until the facts catch up (the renewed licence's expiry in the company file, say), so the
// bundle keeps every stored card the engine did not produce: a closed card stays complete, an
// open one is judged again today by the same rule the engine uses. No arithmetic here.
export function withStoredOccurrences(
  computed: readonly Card[],
  stored: readonly Card[],
  today: IsoDate,
  holidays: readonly string[],
): Card[] {
  const seen = new Set(computed.map((card) => card.id));
  const extra: Card[] = [];
  for (const card of stored) {
    if (seen.has(card.id)) {
      continue;
    }
    const requirement = findRequirement(card.requirementId);
    if (requirement === null) {
      continue;
    }
    seen.add(card.id);
    extra.push({
      ...card,
      state: stateFor({
        dueOn: card.dueOn,
        today,
        leadDays: requirement.defaultLeadDays,
        complete: card.state === 'complete',
        pending: card.dueOn === null && card.state !== 'complete',
      }),
      actBy: card.dueOn === null ? null : actByDate(card.dueOn, holidays),
      subjectId: card.subjectId ?? null,
    });
  }
  return [...computed, ...extra].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
