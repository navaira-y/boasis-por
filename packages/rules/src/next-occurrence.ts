import type { Card, Document, Evidence, IsoDate } from '@boasis/schema';
import { cardId } from './cards';
import { actByDate, addMonths } from './calendar';
import { findRequirement, type Recurrence } from './requirements';
import { stateFor } from './states';

export interface NextOccurrenceContext {
  // The vault, so document evidence can be read for its dates.
  documents?: readonly Document[];
  today: IsoDate;
  holidays?: readonly string[];
}

// Spec 7.3: quarterly and annual tax cards roll over from the period end.
function rollMonths(recurrence: Recurrence): number | null {
  switch (recurrence) {
    case 'yearly':
      return 12;
    case 'quarterly':
      return 3;
    case 'monthly':
      return 1;
    case 'none':
    case 'perPerson':
      return null;
  }
}

// Spec 7.3: closing a recurring card creates the next occurrence from the new document's dates (the
// renewed licence sets next year's licence card, the new policy next year's insurance card).
// Returns null for a one-off requirement, and for a per-person requirement closed without a dated
// document, because the person record's new expiry drives that card, not a guess.
export function nextOccurrence(
  card: Card,
  evidence: Evidence,
  context: NextOccurrenceContext,
): Card | null {
  const requirement = findRequirement(card.requirementId);
  if (requirement === null || requirement.recurrence === 'none') {
    return null;
  }
  let dueOn: IsoDate | null = null;
  if (evidence.kind === 'document') {
    const document = (context.documents ?? []).find((entry) => entry.id === evidence.documentId);
    dueOn = document?.expiryDate ?? null;
  }
  if (dueOn === null) {
    const months = rollMonths(requirement.recurrence);
    if (months === null || card.dueOn === null) {
      return null;
    }
    dueOn = addMonths(card.dueOn, months);
  }
  const holidays = context.holidays ?? [];
  const subjectId = card.subjectId ?? null;
  return {
    id: cardId(requirement.id, subjectId, card.companyId, dueOn),
    companyId: card.companyId,
    requirementId: card.requirementId,
    area: card.area,
    state: stateFor({ dueOn, today: context.today, leadDays: requirement.defaultLeadDays }),
    dueOn,
    actBy: actByDate(dueOn, holidays),
    subjectId,
    responsibleId: card.responsibleId,
    steps: [],
    evidence: [],
  };
}
