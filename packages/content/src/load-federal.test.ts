import { describe, expect, it } from 'vitest';
import { loadFederalRules } from './load-federal';

interface Sourced {
  value: unknown;
  source: string;
  grade: string;
}

function isSourced(node: unknown): node is Sourced {
  return typeof node === 'object' && node !== null && 'source' in node && 'grade' in node;
}

function leaves(node: unknown, path: string): [string, Sourced][] {
  if (isSourced(node)) return [[path, node]];
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, child]) => leaves(child, `${path}.${key}`));
}

describe('federal rules', () => {
  it('validates against the schema', async () => {
    const federal = await loadFederalRules();
    expect(federal.corporateTax.registrationTimelineFrom.value).toBe('2024-03-01');
  });

  it('every value names an official source address and a grade', async () => {
    const federal = await loadFederalRules();
    const all = leaves(federal, 'federal');
    expect(all.length).toBeGreaterThan(0);
    for (const [path, value] of all) {
      expect(value.source, path).toMatch(
        /https:\/\/(tax\.gov\.ae|u\.ae|icp\.gov\.ae|mof\.gov\.ae|www\.uaelegislation\.gov\.ae)\//,
      );
    }
  });

  it('keeps unverified rules out of the live values', async () => {
    const federal = await loadFederalRules();
    expect(federal.corporateTax.lateRegistrationWaiver.value).toBeNull();
    expect(federal.corporateTax.lateRegistrationWaiver.grade).toBe('unclear');
    expect(federal.vat.applicationWindowDays.value).toBeNull();
    expect(federal.vat.applicationWindowDays.grade).toBe('unclear');
  });
});
