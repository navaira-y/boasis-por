import { describe, expect, it } from 'vitest';
import { initialsOf } from '../Avatar/Avatar';
import { COLOUR_SLOTS, colourSlot, stableHash } from './hash';

describe('stableHash and colourSlot', () => {
  it('is stable: the same id gives the same slot every time', () => {
    expect(stableHash('person-1')).toBe(stableHash('person-1'));
    expect(colourSlot('person-1')).toBe(colourSlot('person-1'));
    expect(stableHash('')).toBe(0x811c9dc5);
  });

  it('stays inside the token range', () => {
    for (const id of [
      'a',
      'b',
      'c',
      'person-1',
      'company-42',
      'Hind Al Marzouqi',
      'x'.repeat(200),
    ]) {
      const slot = colourSlot(id);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThan(COLOUR_SLOTS);
      expect(Number.isInteger(slot)).toBe(true);
    }
  });

  it('spreads nearby ids over the slots', () => {
    const slots = new Set<number>();
    for (let index = 0; index < 64; index += 1) {
      slots.add(colourSlot(`id-${String(index)}`));
    }
    expect(slots.size).toBe(COLOUR_SLOTS);
  });

  it('does not depend on the platform: known values', () => {
    expect(stableHash('a')).toBe(0xe40c292c);
    expect(stableHash('foobar')).toBe(0xbf9cf968);
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words, else the first two letters', () => {
    expect(initialsOf('Hind Al Marzouqi')).toBe('HA');
    expect(initialsOf('Omar')).toBe('OM');
    expect(initialsOf('  sara   khan ')).toBe('SK');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('X')).toBe('X');
  });
});
