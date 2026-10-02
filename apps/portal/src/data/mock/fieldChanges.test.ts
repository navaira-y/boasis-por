import { describe, expect, it } from 'vitest';
import { fieldChanges, fieldLabel, fieldList } from './fieldChanges';

describe('fieldChanges', () => {
  it('walks into objects and names each changed field by its path', () => {
    const before = { id: 'x', identity: { name: 'A', category: null }, tax: { trn: '1' } };
    const after = { id: 'x', identity: { name: 'A', category: 'Trade' }, tax: { trn: '2' } };
    expect(fieldChanges(before, after)).toEqual([
      { path: 'identity.category', oldValue: null, newValue: 'Trade' },
      { path: 'tax.trn', oldValue: '1', newValue: '2' },
    ]);
  });

  it('treats a list as one field', () => {
    const changes = fieldChanges({ list: [1] }, { list: [1, 2] });
    expect(changes).toEqual([{ path: 'list', oldValue: [1], newValue: [1, 2] }]);
  });

  it('treats a group filled from not entered as one field, and absent as null', () => {
    expect(fieldChanges({ owner: null }, { owner: { name: 'B' } })).toEqual([
      { path: 'owner', oldValue: null, newValue: { name: 'B' } },
    ]);
    expect(fieldChanges({ a: 1 }, { a: 1, b: undefined })).toEqual([]);
  });
});

describe('field names', () => {
  it('reads a path as words, with the short names written as people write them', () => {
    expect(fieldLabel('identity.licenceCategory')).toBe('licence category');
    expect(fieldLabel('tax.vat.trn')).toBe('TRN');
    expect(
      fieldList([
        { path: 'a.one', oldValue: 1, newValue: 2 },
        { path: 'a.two', oldValue: 1, newValue: 2 },
      ]),
    ).toBe('one and two');
  });
});
