import { describe, expect, it } from 'vitest';
import { FEDERAL } from './testing/federal';
import { auditRequired, ejariRequired, wpsApplies } from './applies';
import { computeCards } from './cards';
import { decisionPoint } from './decision-point';
import { requirementId } from './requirements';
import { questionsToAsk, resolveFact } from './resolve';
import {
  TODAY,
  document,
  emptyAuthority,
  fact,
  mainlandAuthority,
  srtipAuthority,
  srtipFacts,
} from './testing/fixtures';

const empty = emptyAuthority('srtip');

// An SRTIP file that carries the cancellation terms, so the file layer has something to say.
const withTerms = srtipAuthority({
  licence: {
    renewalLeadDays: fact(90),
    cancellationWindowDays: fact(90, 'reported'),
    cancellationFeesInsideWindow: fact([{ name: 'cancellation', amountAed: 1000 }], 'reported'),
    cancellationFeesOutsideWindow: fact(
      [
        { name: 'cancellation', amountAed: 2000 },
        { name: 'admin', amountAed: 500 },
      ],
      'reported',
    ),
  },
});

function agreement(confirmedOn: string | null, uploadedOn = '2025-10-02', id = 'do-agreement') {
  return document('co-srtip', id, {
    type: 'authority-agreement',
    title: 'Zone licence agreement',
    uploadedOn,
    extracted: {
      cancellationWindowDays: { value: 60, confirmedOn },
      cancellationFeeInsideAed: { value: 750, confirmedOn },
      cancellationFeeOutsideAed: { value: 3000, confirmedOn },
      renewalBundle: { value: ['licence', 'flexi-desk'], confirmedOn },
    },
  });
}

const answered = srtipFacts({
  answers: [
    {
      questionId: 'cancellationWindowDays',
      answer: 30,
      answeredOn: '2026-09-01',
      source: 'owner-answer',
    },
  ],
});

describe('resolveFact precedence (build plan 3A)', () => {
  it('reads the document before the file, the file before the answer, then unknown', () => {
    const everything = { facts: answered, authority: withTerms, documents: [agreement(TODAY)] };
    expect(resolveFact('cancellationWindowDays', everything)).toEqual({
      value: 60,
      source: 'document',
      grade: 'confirmed',
    });
    // The file value here is only reported, so the owner's answer beats it.
    expect(resolveFact('cancellationWindowDays', { ...everything, documents: [] })).toEqual({
      value: 30,
      source: 'owner-answer',
      grade: 'reported',
    });
    // A confirmed file value is Boasis-verified and beats the answer.
    const confirmedFile = srtipAuthority({ licence: { cancellationWindowDays: fact(90) } });
    expect(
      resolveFact('cancellationWindowDays', { facts: answered, authority: confirmedFile }),
    ).toEqual({ value: 90, source: 'authority-file', grade: 'confirmed' });
    // With no answer, a reported file value still serves.
    expect(
      resolveFact('cancellationWindowDays', { facts: srtipFacts(), authority: withTerms }),
    ).toEqual({ value: 90, source: 'authority-file', grade: 'reported' });
    expect(resolveFact('cancellationWindowDays', { facts: answered, authority: empty })).toEqual({
      value: 30,
      source: 'owner-answer',
      grade: 'reported',
    });
    expect(
      resolveFact('cancellationWindowDays', { facts: srtipFacts(), authority: empty }),
    ).toEqual({ value: null, source: 'unknown', grade: 'unclear' });
  });

  it('ignores an extracted value nobody confirmed (spec 5.1)', () => {
    // No answer on file here, so the unconfirmed document falls through to the file layer.
    const context = { facts: srtipFacts(), authority: withTerms, documents: [agreement(null)] };
    expect(resolveFact('cancellationWindowDays', context).source).toBe('authority-file');
    expect(resolveFact('cancellationFeeInsideAed', context).value).toBe(1000);
    expect(
      resolveFact('renewalBundle', {
        facts: srtipFacts(),
        authority: empty,
        documents: [agreement(null)],
      }).source,
    ).toBe('unknown');
  });

  it('takes the newest confirmed document and sums the file fee lines', () => {
    const older = agreement(TODAY, '2025-10-02', 'do-old');
    const newer = document('co-srtip', 'do-new', {
      type: 'authority-agreement',
      uploadedOn: '2026-01-15',
      extracted: { cancellationWindowDays: { value: 45, confirmedOn: '2026-01-16' } },
    });
    const context = { facts: srtipFacts(), authority: withTerms, documents: [older, newer] };
    expect(resolveFact('cancellationWindowDays', context).value).toBe(45);
    // The newer document lacks the fees, so the older confirmed one still carries them.
    expect(resolveFact('cancellationFeeOutsideAed', context).value).toBe(3000);
    expect(resolveFact('cancellationFeeOutsideAed', { ...context, documents: [] }).value).toBe(
      2500,
    );
    expect(resolveFact('renewalBundle', context)).toEqual({
      value: ['licence', 'flexi-desk'],
      source: 'document',
      grade: 'confirmed',
    });
  });

  it('takes the latest answer of the right type', () => {
    const facts = srtipFacts({
      answers: [
        {
          questionId: 'ejariRequired',
          answer: true,
          answeredOn: '2026-08-01',
          source: 'owner-answer',
        },
        {
          questionId: 'ejariRequired',
          answer: false,
          answeredOn: '2026-09-01',
          source: 'owner-answer',
        },
        {
          questionId: 'wpsApplies',
          answer: 'yes',
          answeredOn: '2026-09-01',
          source: 'owner-answer',
        },
        {
          questionId: 'renewalBundle',
          answer: 'licence, flexi-desk, ',
          answeredOn: '2026-09-01',
          source: 'owner-answer',
        },
      ],
    });
    const context = { facts, authority: empty };
    expect(resolveFact('ejariRequired', context).value).toBe(false);
    expect(resolveFact('wpsApplies', context).source).toBe('unknown');
    expect(resolveFact('renewalBundle', context).value).toEqual(['licence', 'flexi-desk']);
  });

  it('reads the mainland identity for WPS and a rule text for the general assembly', () => {
    const mainland = { facts: srtipFacts(), authority: mainlandAuthority() };
    expect(
      resolveFact('wpsApplies', {
        facts: srtipFacts(),
        authority: emptyAuthority('dubai-mainland'),
      }),
    ).toEqual({ value: true, source: 'authority-file', grade: 'confirmed' });
    expect(resolveFact('generalAssemblyRequired', mainland).value).toBe(true);
    expect(
      resolveFact('generalAssemblyRequired', { facts: srtipFacts(), authority: empty }).value,
    ).toBeNull();
  });

  it('feeds the applicability helpers', () => {
    const facts = srtipFacts({
      answers: [
        {
          questionId: 'auditRequiredForRenewal',
          answer: true,
          answeredOn: TODAY,
          source: 'owner-answer',
        },
        { questionId: 'ejariRequired', answer: false, answeredOn: TODAY, source: 'owner-answer' },
        { questionId: 'wpsApplies', answer: true, answeredOn: TODAY, source: 'owner-answer' },
      ],
    });
    const context = { facts, authority: empty, offices: [], people: [] };
    expect(auditRequired(context)).toBe('yes');
    expect(ejariRequired(context)).toBe('no');
    expect(wpsApplies(context)).toBe('yes');
    // The file beats the answer.
    expect(ejariRequired({ ...context, authority: mainlandAuthority() })).toBe('yes');
  });
});

describe('questionsToAsk (spec 5.6, 18.1)', () => {
  it('asks everything for a company with nothing, in a stable order', () => {
    const questions = questionsToAsk({ facts: srtipFacts(), authority: empty });
    expect(questions.map((question) => question.id)).toEqual([
      'auditRequiredForRenewal',
      'cancellationWindowDays',
      'cancellationFeeInsideAed',
      'cancellationFeeOutsideAed',
      'renewalBundle',
      'wpsApplies',
      'ejariRequired',
      'generalAssemblyRequired',
      'leaseMinimumRemainingDays',
    ]);
    for (const question of questions) {
      expect(question.text.length).toBeGreaterThan(0);
      expect(question.unblocks.length).toBeGreaterThan(0);
    }
    expect(questions[0]?.unblocks).toBe('audited-accounts');
  });

  it('asks only what the file lacks', () => {
    const ids = questionsToAsk({ facts: srtipFacts(), authority: srtipAuthority() }).map(
      (q) => q.id,
    );
    expect(ids).toEqual([
      'cancellationWindowDays',
      'cancellationFeeInsideAed',
      'cancellationFeeOutsideAed',
      'renewalBundle',
      'generalAssemblyRequired',
      'leaseMinimumRemainingDays',
    ]);
    expect(
      questionsToAsk({ facts: srtipFacts(), authority: mainlandAuthority() }).map((q) => q.id),
    ).toEqual([
      'cancellationWindowDays',
      'cancellationFeeInsideAed',
      'cancellationFeeOutsideAed',
      'renewalBundle',
    ]);
  });

  it('stops asking what an uploaded agreement answers', () => {
    const ids = questionsToAsk({
      facts: srtipFacts(),
      authority: srtipAuthority(),
      documents: [agreement(TODAY)],
    }).map((q) => q.id);
    expect(ids).toEqual(['generalAssemblyRequired', 'leaseMinimumRemainingDays']);
    // An unconfirmed agreement answers nothing.
    expect(
      questionsToAsk({
        facts: srtipFacts(),
        authority: srtipAuthority(),
        documents: [agreement(null)],
      }).length,
    ).toBe(6);
  });
});

describe('the decision point and the cards read through resolve', () => {
  it('shows the cancellation terms from the uploaded agreement before any file', () => {
    const point = decisionPoint(srtipFacts(), withTerms, TODAY, [agreement(TODAY)]);
    expect(point.cancellation.windowDays).toEqual({
      value: 60,
      source: 'document',
      grade: 'confirmed',
    });
    expect(point.cancellation.feeInsideAed.value).toBe(750);
    expect(point.cancellation.feeOutsideAed.value).toBe(3000);
    expect(point.renewalBundle.value).toEqual(['licence', 'flexi-desk']);
    const fromFile = decisionPoint(srtipFacts(), withTerms, TODAY);
    expect(fromFile.cancellation.windowDays.source).toBe('authority-file');
    expect(fromFile.cancellation.feeOutsideAed.value).toBe(2500);
  });

  it('lets an answer settle a card under an empty authority file', () => {
    const base = {
      offices: [],
      people: [],
      documents: [],
      existingCards: [],
      authority: empty,
      today: TODAY,
      federal: FEDERAL,
      holidays: [],
    };
    const silent = computeCards({ ...base, facts: srtipFacts() });
    expect(
      silent.find((card) => card.requirementId === requirementId('audited-accounts'))?.state,
    ).toBe('unknown');
    expect(
      silent.some((card) => card.requirementId === requirementId('office-lease-and-ejari')),
    ).toBe(true);

    const facts = srtipFacts({
      answers: [
        {
          questionId: 'auditRequiredForRenewal',
          answer: true,
          answeredOn: TODAY,
          source: 'owner-answer',
        },
        { questionId: 'ejariRequired', answer: false, answeredOn: TODAY, source: 'owner-answer' },
      ],
    });
    const answeredCards = computeCards({ ...base, facts });
    expect(
      answeredCards.find((card) => card.requirementId === requirementId('audited-accounts'))?.state,
    ).not.toBe('unknown');
    expect(
      answeredCards.some((card) => card.requirementId === requirementId('office-lease-and-ejari')),
    ).toBe(false);
  });
});
