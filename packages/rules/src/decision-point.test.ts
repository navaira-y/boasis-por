import { describe, expect, it } from 'vitest';
import { decisionNeeded, decisionPoint, isMainlandLlc } from './decision-point';
import {
  TODAY,
  mainlandAuthority,
  mainlandFacts,
  srtipAuthority,
  srtipFacts,
} from './testing/fixtures';

const srtip = srtipAuthority();
const mainland = mainlandAuthority();

// The fixture files carry no cancellation terms and no bundle, so each resolves to unknown.
const unknown = { value: null, source: 'unknown', grade: 'unclear' };
const noTerms = {
  cancellation: { windowDays: unknown, feeInsideAed: unknown, feeOutsideAed: unknown },
  renewalBundle: unknown,
};

describe('decisionPoint (spec 10)', () => {
  it('opens 90 days before the licence expiry', () => {
    const point = decisionPoint(srtipFacts(), srtip, TODAY);
    expect(point).toEqual({
      expiry: '2026-09-30',
      leadDays: 90,
      since: '2026-07-02',
      open: true,
      answered: false,
      answer: null,
      closingPrompt: null,
      ...noTerms,
    });
    expect(decisionNeeded(point)).toBe(true);
    expect(decisionPoint(srtipFacts(), srtip, '2026-07-01').open).toBe(false);
    expect(decisionPoint(srtipFacts(), srtip, '2026-07-02').open).toBe(true);
  });

  it('closes once answered for this expiry, not for an older one', () => {
    const answered = srtipFacts({
      decision: { forExpiry: '2026-09-30', answer: 'renew', thinkingOfClosing: null },
    });
    const point = decisionPoint(answered, srtip, TODAY);
    expect(point.open).toBe(false);
    expect(point.answer).toBe('renew');
    expect(decisionNeeded(point)).toBe(false);

    const stale = srtipFacts({
      decision: { forExpiry: '2025-09-30', answer: 'renew', thinkingOfClosing: null },
    });
    expect(decisionPoint(stale, srtip, TODAY).open).toBe(true);
  });

  it('adds the 180-day closing prompt for a mainland LLC (spec 5.6, 9)', () => {
    const point = decisionPoint(mainlandFacts(), mainland, TODAY);
    expect(isMainlandLlc(mainlandFacts(), mainland)).toBe(true);
    expect(point.leadDays).toBe(180);
    expect(point.since).toBe('2026-11-30');
    expect(point.open).toBe(false);
    expect(point.closingPrompt).toEqual({
      since: '2026-09-01',
      open: true,
      answered: false,
      thinkingOfClosing: null,
    });
    expect(decisionNeeded(point)).toBe(true);
  });

  it('settles the prompt by its own answer or by the main answer', () => {
    const prompted = mainlandFacts({
      decision: { forExpiry: '2027-02-28', answer: null, thinkingOfClosing: false },
    });
    const point = decisionPoint(prompted, mainland, TODAY);
    expect(point.closingPrompt?.open).toBe(false);
    expect(point.closingPrompt?.thinkingOfClosing).toBe(false);
    expect(decisionNeeded(point)).toBe(false);

    const renewed = mainlandFacts({
      decision: { forExpiry: '2027-02-28', answer: 'renew', thinkingOfClosing: null },
    });
    expect(decisionPoint(renewed, mainland, '2026-12-15').closingPrompt?.answered).toBe(true);
    expect(decisionNeeded(decisionPoint(renewed, mainland, '2026-12-15'))).toBe(false);
  });

  it('gives no prompt to a mainland sole establishment or a free zone company', () => {
    const sole = mainlandFacts({ identity: { legalForm: 'sole-establishment' } });
    expect(decisionPoint(sole, mainland, TODAY).closingPrompt).toBeNull();
    expect(isMainlandLlc(srtipFacts({ identity: { legalForm: 'llc' } }), srtip)).toBe(false);
  });
});
