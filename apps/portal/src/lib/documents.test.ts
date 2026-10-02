import { describe, expect, it } from 'vitest';
import { documentFlag } from './documents';

describe('documentFlag', () => {
  const today = '2026-09-13';

  it('marks a paper whose date has passed as expired, never due soon', () => {
    expect(documentFlag('2026-09-12', today)).toBe('expired');
    expect(documentFlag('2025-01-01', today)).toBe('expired');
  });

  it('marks due soon only inside the sixty day lead', () => {
    expect(documentFlag('2026-09-13', today)).toBe('due-soon');
    expect(documentFlag('2026-11-12', today)).toBe('due-soon');
    expect(documentFlag('2026-11-13', today)).toBeNull();
    expect(documentFlag('2027-09-13', today)).toBeNull();
  });

  it('flags nothing for a paper without a date', () => {
    expect(documentFlag(null, today)).toBeNull();
  });
});
