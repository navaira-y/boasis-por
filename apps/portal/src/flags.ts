// Feature flags. Typed as booleans, not literals, so a flag can flip without a type error
// cascading through every screen that reads it.
export interface Flags {
  // The assistant slot in the chrome and the assistant panel (the Brain, full launch).
  readonly assistant: boolean;
  // Services inside the portal (spec 9A, MVP 2).
  readonly services: boolean;
}

export const flags: Flags = {
  assistant: false,
  services: false,
};
