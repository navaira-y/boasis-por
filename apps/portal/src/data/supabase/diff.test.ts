import { describe, expect, it } from 'vitest';
import { fieldChanges, fieldLabel, fieldList, toJson } from './diff';

// Parity with the mock's fieldChanges: the supabase layer must diff records exactly as the
// reference implementation does, or the history drifts between data modes.
describe('fieldChanges', () => {
  it('walks into plain objects and skips the top-level id', () => {
    expect(fieldChanges({ id: 'a', name: 'x' }, { id: 'b', name: 'y' })).toEqual([
      { path: 'name', oldValue: 'x', newValue: 'y' },
    ]);
  });

  it('treats a list as one field', () => {
    expect(fieldChanges({ tags: ['a'] }, { tags: ['a', 'b'] })).toEqual([
      { path: 'tags', oldValue: ['a'], newValue: ['a', 'b'] },
    ]);
  });

  it('treats a group filled from null as one field', () => {
    expect(fieldChanges({ tax: null }, { tax: { year: 2026 } })).toEqual([
      { path: 'tax', oldValue: null, newValue: { year: 2026 } },
    ]);
  });

  it('returns nothing when equal', () => {
    expect(fieldChanges({ a: 1 }, { a: 1 })).toEqual([]);
  });
});

describe('toJson', () => {
  it('stores undefined as null', () => {
    expect(toJson(undefined)).toBeNull();
  });
});

describe('fieldLabel', () => {
  it('reads the last part as people write it', () => {
    expect(fieldLabel('identity.licenceCategory')).toBe('licence category');
    expect(fieldLabel('tax.vat.trn')).toBe('TRN');
    expect(fieldLabel('eSignatureCards')).toBe('e-signature cards');
  });
});

describe('fieldList', () => {
  const change = (path: string) => ({ path, oldValue: null, newValue: null });

  it('joins up to three names, then counts the rest', () => {
    expect(fieldList([change('a')])).toBe('a');
    expect(fieldList([change('a'), change('b')])).toBe('a and b');
    expect(fieldList([change('a'), change('b'), change('c')])).toBe('a, b and c');
    expect(
      fieldList([change('a'), change('b'), change('c'), change('d'), change('e')]),
    ).toBe('a, b, c and 2 more');
  });
});
