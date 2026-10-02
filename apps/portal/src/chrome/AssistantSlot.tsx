import { flags } from '../flags';
import './AssistantSlot.css';

// The assistant's place in the chrome (build plan section 4). Rendered on every screen, hidden
// until the assistant flag is on. The Yara orb is the intended face of it.
export function AssistantSlot() {
  return (
    <div className="assistant-slot" hidden={!flags.assistant} data-testid="assistant-slot">
      <button type="button" className="assistant-slot__button" aria-label="Open the assistant">
        Ask
      </button>
    </div>
  );
}
