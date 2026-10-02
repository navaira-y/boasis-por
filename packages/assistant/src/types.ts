import type {
  AuthorityFile,
  Card,
  CompanyFacts,
  Document,
  RequirementId,
  Office,
  Person,
} from '@boasis/schema';

// What the assistant hands back to a screen. Text plus, when it has them, the sources it read
// and the steps it proposes. A proposal is a suggestion; a human tick closes every card.
export interface AssistantAnswer {
  text: string;
  sources: string[];
  proposedSteps: string[];
}

// Everything a classifier may read about one company: the facts, its premises and its people.
// Per-person and per-office requirements need the last two (spec 7.2).
export interface ClassifierInput {
  facts: CompanyFacts;
  offices: readonly Office[];
  people: readonly Person[];
  // The company's documents, so confirmed document terms resolve first (decision 0005).
  documents: readonly Document[];
}

// One decision per requirement: it applies, or it needs a fact the company has not given yet.
export interface RequirementDecision {
  requirementId: RequirementId;
  applicability: 'yes' | 'unknown';
}

// Which requirements apply to this company. MVP 1 reads the authority file; the full launch swaps
// in the Brain behind a flag per company.
export interface RequirementClassifier {
  classify(input: ClassifierInput, authority: AuthorityFile): RequirementDecision[];
  applicableRequirements(input: ClassifierInput, authority: AuthorityFile): RequirementId[];
}

// An event on a company or a person that the assistant can guide (spec 5.6 and 6.3).
export interface AssistantEvent {
  kind: string;
  companyId: string;
  subjectId: string | null;
}

// The context a question is asked in: the company and, when the screen has one, the card.
export interface AssistantContext {
  facts: CompanyFacts;
  card: Card | null;
}

// The interface every screen calls. MVP 1 ships a plain implementation that returns static
// text; the full launch swaps in the Brain without touching a screen.
export interface Assistant {
  explain(card: Card): Promise<AssistantAnswer>;
  guide(event: AssistantEvent): Promise<AssistantAnswer>;
  answer(question: string, context: AssistantContext): Promise<AssistantAnswer>;
}

// The new-company branch of Add a company. The Brain will run the setup journey and return the
// facts of the company it created.
export interface SetupJourney {
  start(): Promise<CompanyFacts>;
}
