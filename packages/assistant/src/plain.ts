import type { Assistant, AssistantAnswer, SetupJourney } from './types';

function answer(text: string): AssistantAnswer {
  return { text, sources: [], proposedSteps: [] };
}

// The plain assistant returns static text. It never guesses a rule, a date, a fee or a step.
export const plainAssistant: Assistant = {
  explain(card) {
    return Promise.resolve(
      answer(
        `The card "${card.requirementId}" is ${card.state}. The library entry for this requirement explains it.`,
      ),
    );
  },
  guide(event) {
    return Promise.resolve(
      answer(`The playbook for "${event.kind}" lists the steps for this authority in order.`),
    );
  },
  answer(_question, context) {
    return Promise.resolve(
      answer(
        `The assistant is not available yet. The facts of ${context.facts.identity.tradeName} and the authority file are the only sources it will use.`,
      ),
    );
  },
};

// The new-company branch is wired but not built. It arrives with the Brain at full launch.
export const notAvailableJourney: SetupJourney = {
  start() {
    return Promise.reject(new Error('The setup journey is not available yet'));
  },
};
