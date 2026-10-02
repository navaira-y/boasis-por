import { describe, expect, it } from 'vitest';
import { nowStamp, today } from './today';

describe('today', () => {
  it('writes the Asia/Dubai calendar date as YYYY-MM-DD', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is the Dubai day, not the UTC day: 22:30 UTC is already tomorrow in Dubai', () => {
    expect(today(new Date('2026-09-12T22:30:00Z'))).toBe('2026-09-13');
    expect(today(new Date('2026-09-12T19:30:00Z'))).toBe('2026-09-12');
  });
});

describe('nowStamp', () => {
  it('writes the Dubai moment with its offset', () => {
    expect(nowStamp(new Date('2026-09-12T22:30:05Z'))).toBe('2026-09-13T02:30:05+04:00');
    expect(nowStamp(new Date('2026-09-12T05:00:00Z'))).toBe('2026-09-12T09:00:00+04:00');
  });
});
