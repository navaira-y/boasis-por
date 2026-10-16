import { describe, expect, it } from 'vitest';
import {
  codeDigits,
  codeLengthFrom,
  DEFAULT_CODE_LENGTH,
  MAX_CODE_LENGTH,
  MIN_CODE_LENGTH,
  pastedDigits,
} from './code-length';

/**
 * The live project sent EIGHT digits while the screen rendered six boxes and the
 * copy promised "six-digit". The visitor could not type their own code. These
 * cover the range Supabase projects can be set to, and the fallback.
 */
describe('the code length the screen renders', () => {
  it('takes every length a Supabase project can be set to', () => {
    for (const length of [6, 7, 8, 9, 10]) expect(codeLengthFrom(length)).toBe(length);
  });

  it('falls back to six when the project does not say, or says something unusable', () => {
    for (const bad of [null, undefined, 5, 11, 0, -3, 6.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(codeLengthFrom(bad)).toBe(DEFAULT_CODE_LENGTH);
    }
  });

  it('is what the live project needs: eight, not six', () => {
    expect(codeLengthFrom(8)).toBe(8);
  });

  it('keeps the range the server accepts and the screen renders in step', () => {
    expect(MIN_CODE_LENGTH).toBe(6);
    expect(MAX_CODE_LENGTH).toBe(10);
  });
});

describe('the digit boxes the screen renders', () => {
  it('gives one box per digit the project sends, so a code can be typed in full', () => {
    expect(codeDigits(8)).toHaveLength(8);
    expect(codeDigits(6)).toHaveLength(6);
    expect(codeDigits(null)).toHaveLength(DEFAULT_CODE_LENGTH);
    expect(codeDigits(8).every((box) => box === '')).toBe(true);
  });
});

describe('a pasted code', () => {
  it('keeps every digit the visitor pasted', () => {
    expect(pastedDigits('12345678', 8)).toEqual('12345678'.split(''));
  });

  it('ignores spaces, letters and the rest of the email around the digits', () => {
    expect(pastedDigits('your code is 1234 5678 thanks', 8)).toEqual('12345678'.split(''));
  });

  it('grows the row when the paste is longer than the boxes we rendered', () => {
    // Dropping digits here would leave the visitor with a code they cannot submit.
    expect(pastedDigits('12345678', 6)).toHaveLength(8);
    expect(pastedDigits('1234567890', 6)).toHaveLength(MAX_CODE_LENGTH);
  });

  it('does nothing when there is no digit in the paste', () => {
    expect(pastedDigits('no code here', 8)).toEqual([]);
    expect(pastedDigits('', 8)).toEqual([]);
  });
});
