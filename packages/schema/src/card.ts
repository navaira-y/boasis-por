import { z } from 'zod';
import { Area, RequirementId, Id, IsoDate } from './common';

// Spec 7.1. Severity order when several apply: overdue, expiring, action-soon, decision-needed,
// unknown, on-track, complete. The ordering itself is applied in packages/rules.
export const CardState = z.enum([
  'complete',
  'on-track',
  'action-soon',
  'expiring',
  'overdue',
  'unknown',
  'decision-needed',
]);
export type CardState = z.infer<typeof CardState>;

export const Step = z.object({
  id: Id,
  title: z.string().min(1),
  done: z.boolean(),
  doneOn: IsoDate.nullable(),
  assigneeId: Id.nullable(),
});
export type Step = z.infer<typeof Step>;

export const Evidence = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('document'), documentId: Id }),
  z.object({ kind: z.literal('reference'), reference: z.string().min(1), date: IsoDate }),
]);
export type Evidence = z.infer<typeof Evidence>;

export const Card = z.object({
  id: Id,
  companyId: Id,
  requirementId: RequirementId,
  area: Area,
  state: CardState,
  dueOn: IsoDate.nullable(),
  // The last working day on or before dueOn (spec 7.1); null when there is no date.
  actBy: IsoDate.nullable().optional(),
  // The person, office, bank or activity the card is about (spec 7.2: one card per person,
  // per premises, per account); null for a company-level card.
  subjectId: Id.nullable().optional(),
  // The member responsible for the card's area, or null when unassigned (spec 4.1).
  responsibleId: Id.nullable(),
  steps: z.array(Step),
  evidence: z.array(Evidence),
});
export type Card = z.infer<typeof Card>;
