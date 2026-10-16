import { describe, expect, it } from 'vitest';
import { editDistance, isValidEmail, normalizeEmail, suggestEmailFix } from './email';

describe('isValidEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isValidEmail('navaira.builds@gmail.com')).toBe(true);
    expect(isValidEmail('a@b.co')).toBe(true);
  });

  it('rejects shapes that are not addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('navaira')).toBe(false);
    expect(isValidEmail('navaira@gmail')).toBe(false);
    expect(isValidEmail('navaira @gmail.com')).toBe(false);
    expect(isValidEmail('a..b@gmail.com')).toBe(false);
  });

  it('normalises the way the database stores it', () => {
    expect(normalizeEmail('  Navaira.Builds@Gmail.COM ')).toBe('navaira.builds@gmail.com');
  });
});

describe('editDistance', () => {
  it('counts a swapped pair as one mistake', () => {
    expect(editDistance('gmial.com', 'gmail.com')).toBe(1);
    expect(editDistance('gmail.com', 'gmail.com')).toBe(0);
    expect(editDistance('gmai.com', 'gmail.com')).toBe(1);
  });
});

describe('suggestEmailFix', () => {
  it('suggests the obvious provider typo, keeping the local part', () => {
    expect(suggestEmailFix('navaira@gmial.com')).toBe('navaira@gmail.com');
    expect(suggestEmailFix('navaira@gmail.co')).toBe('navaira@gmail.com');
    expect(suggestEmailFix('navaira@gmail.com')).toBeNull();
  });

  it('stays quiet when the guess would be a reach', () => {
    expect(suggestEmailFix('navaira@boasis.ae')).toBeNull();
    expect(suggestEmailFix('navaira@sharjahfze.ae')).toBeNull();
    expect(suggestEmailFix('navaira@')).toBeNull();
    expect(suggestEmailFix('navaira')).toBeNull();
  });
});
