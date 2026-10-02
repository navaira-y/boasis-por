import type { CompanyProfile } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import {
  incorporationDatesAgree,
  withCompanyProfile,
  withIncorporationDate,
} from './company-profile';
import { known, notSure, skipped } from './testing/fields';
import { srtipFacts } from './testing/fixtures';

function profile(incorporationDate: CompanyProfile['incorporationDate']): CompanyProfile {
  return {
    licenceStatus: known('active'),
    licenceTermYears: known(1),
    incorporationDate,
    website: skipped(),
    handler: known({ kind: 'self' }),
  };
}

describe('the incorporation date writers', () => {
  it('copies a known onboarding answer to the identity', () => {
    const facts = withCompanyProfile(srtipFacts(), profile(known('2024-05-20')));
    expect(facts.identity.incorporationDate).toBe('2024-05-20');
    expect(facts.profile?.incorporationDate).toEqual(known('2024-05-20'));
    expect(incorporationDatesAgree(facts)).toBe(true);
  });

  it('leaves the identity alone for a "not sure" or a skip', () => {
    const before = srtipFacts();
    for (const entry of [notSure<string>(), skipped<string>()]) {
      const facts = withCompanyProfile(before, profile(entry));
      expect(facts.identity.incorporationDate).toBe(before.identity.incorporationDate);
      expect(incorporationDatesAgree(facts)).toBe(true);
    }
  });

  it('keeps both in step when the date is edited later', () => {
    const onboarded = withCompanyProfile(srtipFacts(), profile(known('2024-05-20')));
    const edited = withIncorporationDate(onboarded, known('2024-06-02'));
    expect(edited.identity.incorporationDate).toBe('2024-06-02');
    expect(edited.profile?.incorporationDate).toEqual(known('2024-06-02'));
    expect(incorporationDatesAgree(edited)).toBe(true);
  });

  it('sets only the identity on a company that has no onboarding answers', () => {
    const facts = withIncorporationDate(srtipFacts(), known('2023-02-01'));
    expect(facts.identity.incorporationDate).toBe('2023-02-01');
    expect(facts.profile).toBeUndefined();
  });

  it('detects a file written around the helpers', () => {
    const onboarded = withCompanyProfile(srtipFacts(), profile(known('2024-05-20')));
    const drifted = {
      ...onboarded,
      identity: { ...onboarded.identity, incorporationDate: '2024-01-01' },
    };
    expect(incorporationDatesAgree(drifted)).toBe(false);
  });
});
