import type {
  AuthorityFile,
  CompanyFacts,
  DecisionAnswer,
  Document,
  IsoDate,
} from '@boasis/schema';
import { currentDecision } from './applies';
import { addDays, isOnOrAfter } from './calendar';
import { requirementByKey } from './requirements';
import { resolveFact, type ResolveContext, type Resolved } from './resolve';

// Spec 10 and 5.6: renewal and cancellation are one decision. The portal asks 90 days before the
// licence expiry; a mainland LLC gets the earlier prompt at 180 days, "are you thinking of
// closing?", because a full LLC closure runs three to six months.
export interface ClosingPrompt {
  // The day the prompt opens: licence expiry less 180 days.
  since: IsoDate;
  open: boolean;
  answered: boolean;
  thinkingOfClosing: boolean | null;
}

// Spec 10 Cancel: the cost of cancelling inside the authority's window versus outside it. Each
// value comes from the agreement the person uploaded before any authority file (build plan 3A);
// the spec does not fix which side of the expiry the window sits on, so no date is derived here.
export interface CancellationTerms {
  windowDays: Resolved<number>;
  feeInsideAed: Resolved<number>;
  feeOutsideAed: Resolved<number>;
}

export function cancellationTerms(context: ResolveContext): CancellationTerms {
  return {
    windowDays: resolveFact('cancellationWindowDays', context),
    feeInsideAed: resolveFact('cancellationFeeInsideAed', context),
    feeOutsideAed: resolveFact('cancellationFeeOutsideAed', context),
  };
}

export interface DecisionPoint {
  expiry: IsoDate;
  // Spec 9: the decision point's own lead time, 90, or 180 for the mainland LLC prompt.
  leadDays: number;
  // The day the question opens: licence expiry less 90 days.
  since: IsoDate;
  // Inside the window and not yet answered.
  open: boolean;
  answered: boolean;
  answer: DecisionAnswer | null;
  // Null unless the company is a mainland LLC.
  closingPrompt: ClosingPrompt | null;
  // Spec 10: what the cancel branch shows, and what renews together on the renew branch.
  cancellation: CancellationTerms;
  renewalBundle: Resolved<string[]>;
}

export function isMainlandLlc(facts: CompanyFacts, authority: AuthorityFile): boolean {
  return authority.identity.type.value === 'mainland' && facts.identity.legalForm === 'llc';
}

export function decisionPoint(
  facts: CompanyFacts,
  authority: AuthorityFile,
  today: IsoDate,
  documents: readonly Document[] = [],
): DecisionPoint {
  const context: ResolveContext = { facts, authority, documents };
  const expiry = facts.identity.expiryDate;
  const decision = currentDecision(facts);
  const answer = decision?.answer ?? null;
  const answered = answer !== null;
  const decisionLead = requirementByKey('decision-point').defaultLeadDays;
  const promptLead = requirementByKey('mainland-llc-closing-prompt').defaultLeadDays;
  const since = addDays(expiry, -decisionLead);
  const open = isOnOrAfter(today, since) && !answered;

  let closingPrompt: ClosingPrompt | null = null;
  if (isMainlandLlc(facts, authority)) {
    const promptSince = addDays(expiry, -promptLead);
    const thinkingOfClosing = decision?.thinkingOfClosing ?? null;
    // The main answer also settles the prompt: someone who answered "renew" has answered it.
    const promptAnswered = thinkingOfClosing !== null || answered;
    closingPrompt = {
      since: promptSince,
      open: isOnOrAfter(today, promptSince) && !promptAnswered,
      answered: promptAnswered,
      thinkingOfClosing,
    };
  }

  return {
    expiry,
    leadDays: closingPrompt === null ? decisionLead : promptLead,
    since,
    open,
    answered,
    answer,
    closingPrompt,
    cancellation: cancellationTerms(context),
    renewalBundle: resolveFact('renewalBundle', context),
  };
}

// Spec 7.1: "decision needed" on the licence card while the decision point is open, which for a
// mainland LLC starts with the closing prompt (spec 9).
export function decisionNeeded(point: DecisionPoint): boolean {
  return point.open || point.closingPrompt?.open === true;
}
