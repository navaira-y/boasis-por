import { describe, expect, it } from 'vitest';
import {
  isRed,
  mostSevere,
  severityOf,
  sortBySeverity,
  STATE_LABELS,
  STATE_SEVERITY,
} from './state';

describe('state ordering (spec 7.1)', () => {
  it('lists the seven states most severe first, exactly as the spec does', () => {
    expect(STATE_SEVERITY).toEqual([
      'overdue',
      'expiring',
      'action-soon',
      'decision-needed',
      'unknown',
      'on-track',
      'complete',
    ]);
    expect(Object.keys(STATE_LABELS)).toHaveLength(7);
  });

  it('ranks every state', () => {
    for (const state of STATE_SEVERITY) {
      expect(severityOf(state)).toBeGreaterThanOrEqual(0);
    }
    expect(severityOf('overdue')).toBeLessThan(severityOf('expiring'));
    expect(severityOf('on-track')).toBeLessThan(severityOf('complete'));
  });

  it('picks the most severe of several', () => {
    expect(mostSevere(['complete', 'on-track'])).toBe('on-track');
    expect(mostSevere(['unknown', 'decision-needed', 'action-soon'])).toBe('action-soon');
    expect(mostSevere(['expiring', 'overdue'])).toBe('overdue');
    expect(mostSevere([])).toBeNull();
  });

  it('sorts a copy, most severe first, and keeps the order of equals', () => {
    const cards = [
      { id: 'a', state: 'complete' },
      { id: 'b', state: 'overdue' },
      { id: 'c', state: 'on-track' },
      { id: 'd', state: 'overdue' },
      { id: 'e', state: 'expiring' },
    ] as const;
    const sorted = sortBySeverity(cards, (card) => card.state);
    expect(sorted.map((card) => card.id)).toEqual(['b', 'd', 'e', 'c', 'a']);
    expect(cards[0].id).toBe('a');
  });

  it('counts only overdue as red', () => {
    expect(isRed('overdue')).toBe(true);
    expect(isRed('expiring')).toBe(false);
    expect(isRed('decision-needed')).toBe(false);
  });
});
