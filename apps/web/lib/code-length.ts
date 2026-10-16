/**
 * The entry screen's digit boxes.
 *
 * Supabase lets a project choose 6 to 10 digit codes, and the live project
 * turned out to send EIGHT while the screen rendered six boxes and the copy said
 * "six-digit": the visitor could not type their own code. The number now comes
 * from the project's own settings, and anywhere the real length is unknown the
 * screen falls back to six.
 *
 * Pure module on purpose: the signup form is a client component, so nothing it
 * imports may be server-only.
 */

export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 10;
export const DEFAULT_CODE_LENGTH = 6;

/** The length to render: the project's own answer when it is usable, else six. */
export function codeLengthFrom(otpLength: number | null | undefined): number {
  if (otpLength === null || otpLength === undefined) return DEFAULT_CODE_LENGTH;
  if (!Number.isInteger(otpLength)) return DEFAULT_CODE_LENGTH;
  if (otpLength < MIN_CODE_LENGTH || otpLength > MAX_CODE_LENGTH) return DEFAULT_CODE_LENGTH;
  return otpLength;
}

/** A fresh row of boxes: one per digit this project's codes actually have. */
export function codeDigits(length: number | null | undefined): string[] {
  return Array.from({ length: codeLengthFrom(length) }, () => '');
}

/**
 * What a pasted string becomes: digits only, and never cut short.
 *
 * A visitor pastes the whole email line or the whole code. If the paste is longer
 * than the row we render (a project set to 8 digits, a template that changed under
 * us), the row grows instead of swallowing the extra digits, because dropping them
 * would leave the visitor with a code that cannot be submitted.
 */
export function pastedDigits(text: string, currentLength: number | null | undefined): string[] {
  const digitsOnly = text.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH);
  if (digitsOnly.length === 0) return [];
  const width = Math.max(codeLengthFrom(currentLength), digitsOnly.length);
  return Array.from({ length: width }, (_, index) => digitsOnly[index] ?? '');
}
