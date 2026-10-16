/**
 * The entry screen's digit boxes.
 *
 * Supabase lets a project choose 6 to 10 digit codes, and the live project sends
 * EIGHT while the screen drew six boxes and the copy said "six-digit": the
 * visitor could not type their own code. The length is asked for rather than
 * assumed, and it is never GUESSED:
 *
 *   the project answers with a usable length -> exactly that many boxes, and the
 *                                               row submits itself when complete
 *   anything else (no answer, unusable value) -> six boxes that GROW as the
 *                                               visitor types, and no automatic
 *                                               submit, because firing at a
 *                                               guessed length would reject a
 *                                               code that is actually correct
 *
 * Pure module on purpose: the signup form is a client component, so nothing it
 * imports may be server-only.
 */

export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 10;
export const DEFAULT_CODE_LENGTH = 6;

/**
 * The project's own length, when it gave us one we can trust, else null.
 *
 * Null is not "six": it means we do not know, and the screen must behave as if
 * any length from 6 to 10 could arrive.
 */
export function knownCodeLength(otpLength: number | null | undefined): number | null {
  if (otpLength === null || otpLength === undefined) return null;
  if (!Number.isInteger(otpLength)) return null;
  if (otpLength < MIN_CODE_LENGTH || otpLength > MAX_CODE_LENGTH) return null;
  return otpLength;
}

/** How many boxes to draw before the visitor starts typing. */
export function boxesToStart(length: number | null): number {
  return length ?? DEFAULT_CODE_LENGTH;
}

/** A fresh row of empty boxes. */
export function codeDigits(length: number | null): string[] {
  return Array.from({ length: boxesToStart(length) }, () => '');
}

/** True while the row may still grow, so a longer code is never trapped. */
export function rowCanGrow(boxes: number): boolean {
  return boxes < MAX_CODE_LENGTH;
}

/**
 * True when the row should add a box as the visitor types.
 *
 * Only while the length is unknown: with a known length the row is already the
 * right size and growing it would look like a bug.
 */
export function growsOnTyping(length: number | null, boxes: number): boolean {
  return length === null && rowCanGrow(boxes);
}

/**
 * What a pasted string becomes: digits only, and never cut short.
 *
 * A visitor pastes the whole code, or the whole line from the email. If the
 * paste is longer than the boxes we drew, the row grows instead of swallowing the
 * extra digits, because dropping them would leave the visitor holding a code they
 * cannot submit.
 */
export function pastedDigits(text: string, length: number | null): string[] {
  const digitsOnly = text.replace(/\D/g, '').slice(0, MAX_CODE_LENGTH);
  if (digitsOnly.length === 0) return [];
  const width = Math.max(boxesToStart(length), digitsOnly.length);
  return Array.from({ length: width }, (_, index) => digitsOnly[index] ?? '');
}

/**
 * The row after one keystroke.
 *
 * The digit lands in its box, and while the length is unknown a digit landing in
 * the last box adds one more. That single line is what lets a visitor with an
 * eight-digit code finish typing under a project whose length we could not read,
 * so it lives here where it can be tested rather than inside the component.
 */
export function typedDigits(
  current: string[],
  index: number,
  digit: string,
  length: number | null,
): string[] {
  const next = [...current];
  next[index] = digit;
  if (digit !== '' && index === current.length - 1 && growsOnTyping(length, current.length)) {
    next.push('');
  }
  return next;
}

/**
 * Whether this many digits could be a real code.
 *
 * The server accepts 6 to 10 and Supabase itself decides if it is right, so the
 * button must never be disabled on a length we merely guessed: that is how a
 * visitor with the correct code ends up unable to press it.
 */
export function isSubmittable(code: string, length: number | null): boolean {
  if (code.length < MIN_CODE_LENGTH || code.length > MAX_CODE_LENGTH) return false;
  if (!/^\d+$/.test(code)) return false;
  if (length === null) return true;
  return code.length >= length;
}

/** True once the typed code is complete, so the form may submit itself. */
export function isComplete(code: string, length: number | null): boolean {
  return length !== null && code.length === length;
}
