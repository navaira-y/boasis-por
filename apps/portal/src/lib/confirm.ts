// The one adapter around window.confirm (rule 12). Lite asks before a person is archived or a
// grant removed; a phone-app wrapper can replace this with a native dialog.
export function confirmAction(message: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.confirm(message);
}
