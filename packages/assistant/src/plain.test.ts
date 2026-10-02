import { describe, expect, it } from 'vitest';
import { notAvailableJourney, plainAssistant } from './plain';

describe('plain assistant', () => {
  it('returns static text without sources or steps', async () => {
    const result = await plainAssistant.guide({
      kind: 'renewal',
      companyId: 'co-1',
      subjectId: null,
    });
    expect(result.text).toContain('renewal');
    expect(result.sources).toEqual([]);
    expect(result.proposedSteps).toEqual([]);
  });

  it('has no setup journey yet', async () => {
    await expect(notAvailableJourney.start()).rejects.toThrow('not available');
  });
});
