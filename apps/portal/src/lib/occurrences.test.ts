import { requirementId } from '@boasis/rules';
import type { Card } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import { withStoredOccurrences } from './occurrences';

const base: Card = {
  id: 'licence-renewal:co-1:2027-09-30',
  companyId: 'co-1',
  requirementId: requirementId('licence-renewal'),
  area: 'licence-and-cards',
  state: 'on-track',
  dueOn: '2027-09-30',
  actBy: '2027-09-30',
  subjectId: null,
  responsibleId: null,
  steps: [],
  evidence: [],
};

describe('withStoredOccurrences', () => {
  it('keeps a stored next occurrence the engine did not compute, judged today', () => {
    const merged = withStoredOccurrences([], [base], '2027-09-20', []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.state).toBe('expiring');
  });

  it('does not duplicate a card the engine computed', () => {
    const merged = withStoredOccurrences(
      [base],
      [{ ...base, state: 'complete' }],
      '2026-09-13',
      [],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.state).toBe('on-track');
  });

  it('keeps a closed card complete', () => {
    const closed: Card = {
      ...base,
      id: 'licence-renewal:co-1:2026-09-30',
      dueOn: '2026-09-30',
      state: 'complete',
    };
    const merged = withStoredOccurrences([], [closed], '2026-09-13', []);
    expect(merged[0]?.state).toBe('complete');
  });
});
