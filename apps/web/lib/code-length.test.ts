import { describe, expect, it } from 'vitest';
import {
  boxesToStart,
  codeDigits,
  growsOnTyping,
  isComplete,
  isSubmittable,
  knownCodeLength,
  MAX_CODE_LENGTH,
  MIN_CODE_LENGTH,
  pastedDigits,
  rowCanGrow,
  typedDigits,
} from './code-length';

/**
 * The live project sent EIGHT digits while the screen rendered six boxes and the
 * copy promised "six-digit", so the visitor could not type their own code. These
 * cover the range a project can be set to, the fallback, and the rule that keeps
 * a guessed length from ever blocking a correct code.
 */
describe('the code length the project reports', () => {
  it('is taken as it is, for every length a project can be set to', () => {
    for (const length of [6, 7, 8, 9, 10]) expect(knownCodeLength(length)).toBe(length);
  });

  it('is unknown, not six, for anything unusable', () => {
    for (const bad of [null, undefined, 5, 11, 0, -3, 6.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(knownCodeLength(bad)).toBeNull();
    }
  });

  it('keeps the range the server accepts in step with the screen', () => {
    expect(MIN_CODE_LENGTH).toBe(6);
    expect(MAX_CODE_LENGTH).toBe(10);
  });
});

describe('the row of boxes', () => {
  it('starts at the project length, or at six when nothing is known', () => {
    expect(codeDigits(8)).toHaveLength(8);
    expect(boxesToStart(8)).toBe(8);
    expect(codeDigits(null)).toHaveLength(MIN_CODE_LENGTH);
    expect(codeDigits(8).every((box) => box === '')).toBe(true);
  });

  it('grows while typing only when the length is unknown', () => {
    // A known eight-digit project already shows eight boxes: growing them would
    // look broken.
    expect(growsOnTyping(null, 6)).toBe(true);
    expect(growsOnTyping(8, 8)).toBe(false);
    expect(growsOnTyping(6, 6)).toBe(false);
    // Never past what any Supabase project can send.
    expect(growsOnTyping(null, MAX_CODE_LENGTH)).toBe(false);
    expect(rowCanGrow(MAX_CODE_LENGTH - 1)).toBe(true);
  });
});

describe('a pasted code', () => {
  it('keeps every digit the visitor pasted', () => {
    expect(pastedDigits('12345678', 8)).toEqual('12345678'.split(''));
  });

  it('ignores spaces, letters and the rest of the email around the digits', () => {
    expect(pastedDigits('your code is 1234 5678 thanks', 8)).toEqual('12345678'.split(''));
  });

  it('grows the row when the paste is longer than the boxes we drew', () => {
    // Dropping digits here would leave the visitor holding a code they cannot
    // submit, which is the live bug in a different costume.
    expect(pastedDigits('12345678', 6)).toHaveLength(8);
    expect(pastedDigits('12345678', null)).toHaveLength(8);
    expect(pastedDigits('1234567890', 6)).toHaveLength(MAX_CODE_LENGTH);
  });

  it('does nothing when there is no digit in the paste', () => {
    expect(pastedDigits('no code here', 8)).toEqual([]);
    expect(pastedDigits('', 8)).toEqual([]);
  });
});

describe('when the code can be submitted', () => {
  it('never blocks a length we merely guessed', () => {
    // Without a reported length, any plausible length must be allowed through:
    // the server is what decides whether the code is right.
    for (const digits of ['123456', '1234567', '12345678', '123456789', '1234567890']) {
      expect(isSubmittable(digits, null)).toBe(true);
    }
  });

  it('holds back the button only while a KNOWN length cannot be complete yet', () => {
    expect(isSubmittable('123456', 8)).toBe(false);
    expect(isSubmittable('12345678', 8)).toBe(true);
    expect(isSubmittable('123456', 6)).toBe(true);
  });

  it('refuses what Supabase would refuse, before a request is made', () => {
    expect(isSubmittable('12345', null)).toBe(false);
    expect(isSubmittable('12345678901', null)).toBe(false);
    expect(isSubmittable('', null)).toBe(false);
    expect(isSubmittable('12345a', null)).toBe(false);
  });

  it('submits itself only at a length the project told us', () => {
    expect(isComplete('12345678', 8)).toBe(true);
    expect(isComplete('123456', 8)).toBe(false);
    // Firing at a guessed six would reject an eight-digit code that is correct.
    expect(isComplete('123456', null)).toBe(false);
  });
});

describe('typing into the row', () => {
  it('adds a box on the last keystroke while the length is unknown', () => {
    // This is the live fix: an eight-digit code must be typeable even when the
    // project never told the screen how long its codes are.
    let row = codeDigits(null);
    expect(row).toHaveLength(6);
    for (const digit of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      row = typedDigits(row, row.findIndex((box) => box === ''), digit, null);
    }
    expect(row.join('')).toBe('12345678');
    // One empty box always stays ahead of the cursor: that is what lets the next
    // digit land somewhere, and it is why the row keeps growing.
    expect(row).toHaveLength(9);
    expect(row[row.length - 1]).toBe('');
    expect(isSubmittable('12345678', null)).toBe(true);
  });

  it('keeps every digit of a six-digit code too', () => {
    let row = codeDigits(null);
    for (const digit of ['1', '2', '3', '4', '5', '6']) {
      row = typedDigits(row, row.findIndex((box) => box === ''), digit, null);
    }
    expect(row.join('')).toBe('123456');
    expect(isSubmittable('123456', null)).toBe(true);
  });

  it('never grows past what any project can send', () => {
    let row = codeDigits(null);
    for (let index = 0; index < 40; index += 1) {
      row = typedDigits(row, row.findIndex((box) => box === ''), '7', null);
    }
    expect(row).toHaveLength(MAX_CODE_LENGTH);
  });

  it('does not grow when the project already told us the length', () => {
    const row = typedDigits(codeDigits(8), 7, '4', 8);
    expect(row).toHaveLength(8);
    expect(row[7]).toBe('4');
  });

  it('leaves other boxes alone', () => {
    const row = typedDigits(['1', '2', '', '4'], 2, '3', 6);
    expect(row).toEqual(['1', '2', '3', '4']);
  });
});
