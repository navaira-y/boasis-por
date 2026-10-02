import { describe, expect, it } from 'vitest';
import { FEDERAL } from './testing/federal';
import {
  TODAY,
  document,
  emptyAuthority,
  mainlandAuthority,
  newHire,
  person,
  srtipAuthority,
} from './testing/fixtures';
import {
  STAGE_ORDER,
  chainComplete,
  chainStatus,
  lastStage,
  passportValidity,
  residencyDeadline,
  stageChain,
  stageIndex,
  stageRule,
  visaStages,
} from './visa-stages';

const srtip = srtipAuthority();
const mainland = mainlandAuthority();
const context = (authority = srtip, documents = [] as ReturnType<typeof document>[]) => ({
  authority,
  documents,
  today: TODAY,
});

describe('the ten stages (spec 6.2)', () => {
  it('are in the schema order', () => {
    expect(visaStages.map((rule) => rule.stage)).toEqual([...STAGE_ORDER]);
    expect(stageIndex('entry')).toBe(3);
    expect(stageRule('medical').title).toContain('Medical');
    expect(() => stageRule('nowhere' as never)).toThrow('no stage');
  });

  it('ends at the work permit on the mainland and the contract in a zone', () => {
    expect(lastStage(person('co', 'p'), mainland)).toBe('work-permit');
    expect(lastStage(person('co', 'p'), srtip)).toBe('labour-contract');
    expect(lastStage(person('co', 'p', { status: { type: 'partner' } }), mainland)).toBe(
      'residence-visa',
    );
    expect(lastStage(person('co', 'p', { status: { type: 'dependant' } }), srtip)).toBe(
      'residence-visa',
    );
  });

  it('gives a person on a family visa the work permit only (spec 6.1)', () => {
    const spouse = person('co', 'p', { status: { sponsor: { kind: 'family', personId: null } } });
    const chain = stageChain(spouse, context(mainland));
    expect(chain.filter((check) => check.applies).map((check) => check.stage)).toEqual([
      'offer-letter',
      'labour-contract',
      'work-permit',
    ]);
  });
});

describe('the entry permit', () => {
  it('lapses after the file validity when unused', () => {
    const hire = newHire('co', 'p');
    const status = chainStatus(hire, context(srtip));
    expect(status.complete).toBe(false);
    expect(status.dueOn).toBe('2026-11-01');
  });

  it('is unknown when the file has no validity', () => {
    const status = chainStatus(newHire('co', 'p'), context(emptyAuthority('srtip')));
    expect(status.dueOn).toBeNull();
    expect(status.unknown).toBe(true);
  });
});

describe('the residency clock', () => {
  it('runs 60 days from entry, 55 under SRTIP, from the file', () => {
    const entered = newHire('co', 'p', { status: { stage: 'entry', entryDate: '2026-09-05' } });
    expect(residencyDeadline(entered, mainland)).toBe('2026-11-04');
    expect(residencyDeadline(entered, srtip)).toBe('2026-10-30');
    expect(residencyDeadline(entered, emptyAuthority('srtip'))).toBe('2026-11-04');
    expect(residencyDeadline(newHire('co', 'p'), srtip)).toBeNull();
  });

  it('drives the chain once the person has entered, and flags the missing policy', () => {
    const entered = newHire('co', 'p', { status: { stage: 'entry', entryDate: '2026-09-05' } });
    const status = chainStatus(entered, context(srtip));
    expect(status.dueOn).toBe('2026-10-30');
    expect(status.blocked).toEqual(['health-insurance']);
  });

  it('honours the three months of the medical certificate', () => {
    const entered = newHire('co', 'p', {
      status: { stage: 'medical', entryDate: '2026-07-01' },
      cover: { healthInsurance: { policyNumber: 'P', endDate: '2027-07-01', paidBy: 'employer' } },
    });
    const medical = document('co', 'doc-med', {
      personId: 'p',
      type: 'medical-result',
      issueDate: '2026-07-10',
      expiryDate: null,
    });
    const chain = stageChain(entered, context(srtip, [medical]));
    expect(chain.find((check) => check.stage === 'medical')?.dueOn).toBe('2026-10-10');
    expect(chainStatus(entered, context(srtip, [medical])).dueOn).toBe('2026-08-25');
  });
});

describe('a stage completed by its document', () => {
  it('marks the medical stage done once the medical result is on file', () => {
    const atMedical = newHire('co', 'p', { status: { stage: 'medical', entryDate: '2026-09-01' } });
    const medicalOf = (checks: ReturnType<typeof stageChain>) =>
      checks.find((check) => check.stage === 'medical')?.position;
    expect(medicalOf(stageChain(atMedical, context(srtip)))).toBe('current');
    const result = document('co', 'doc-med', {
      personId: 'p',
      type: 'medical-result',
      issueDate: '2026-09-07',
      expiryDate: null,
    });
    expect(medicalOf(stageChain(atMedical, context(srtip, [result])))).toBe('done');
  });

  it('ignores a document filed against someone else', () => {
    const atMedical = newHire('co', 'p', { status: { stage: 'medical', entryDate: '2026-09-01' } });
    const other = document('co', 'doc-med', { personId: 'q', type: 'medical-result' });
    expect(
      stageChain(atMedical, context(srtip, [other])).find((check) => check.stage === 'medical')
        ?.position,
    ).toBe('current');
  });
});

describe('the labour contract and the work permit', () => {
  it('needs the mainland contract within 14 days of entry', () => {
    const entered = person('co', 'p', { status: { stage: 'residence-visa', contractStart: null } });
    const chain = stageChain(entered, context(mainland));
    expect(chain.find((check) => check.stage === 'labour-contract')?.dueOn).toBe('2025-12-04');
    expect(
      stageChain(entered, context(srtip)).find((check) => check.stage === 'labour-contract')?.dueOn,
    ).toBeNull();
  });

  it('blocks only the stage next in the chain, never one further ahead', () => {
    // At the entry permit, the next stage is entry: the missing policy (stage 5) is not a block
    // yet, and the permit's own two-year clock is not a reason to act soon.
    const waiting = newHire('co', 'p', { cover: { healthInsurance: null } });
    const chain = stageChain(waiting, context(srtip));
    expect(chain.find((check) => check.stage === 'health-insurance')?.blocked).toBe(false);
    expect(chainStatus(waiting, context(srtip)).blocked).toEqual([]);
  });

  it('is blocked on the mainland without the unemployment insurance certificate', () => {
    const status = chainStatus(person('co', 'p'), context(mainland));
    expect(status.complete).toBe(false);
    expect(status.blocked).toEqual(['work-permit']);
  });
});

describe('completion', () => {
  it('is complete with the stamped visa and the signed contract in a zone', () => {
    expect(chainComplete(person('co', 'p'), context(srtip))).toBe(true);
    expect(
      chainComplete(person('co', 'p', { status: { contractStart: null } }), context(srtip)),
    ).toBe(false);
    const signed = document('co', 'doc-lc', { personId: 'p', type: 'labour-contract' });
    expect(
      chainComplete(
        person('co', 'p', { status: { contractStart: null } }),
        context(srtip, [signed]),
      ),
    ).toBe(true);
  });

  it('is complete with the work permit on the mainland, and the stamped visa for a partner', () => {
    expect(chainComplete(person('co', 'p'), context(mainland))).toBe(false);
    expect(
      chainComplete(
        person('co', 'p', { status: { workPermitExpiry: '2027-11-19' } }),
        context(mainland),
      ),
    ).toBe(true);
    expect(
      chainComplete(person('co', 'p', { status: { type: 'partner' } }), context(mainland)),
    ).toBe(true);
    expect(chainStatus(person('co', 'p'), context(srtip))).toEqual({
      complete: true,
      dueOn: null,
      unknown: false,
      blocked: [],
    });
  });

  it('positions the stages around the recorded one', () => {
    const chain = stageChain(newHire('co', 'p'), context(srtip));
    expect(chain.map((check) => check.position)).toEqual([
      'done',
      'done',
      'current',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });
});

describe('passport validity (spec 6.3)', () => {
  it('reads the new and renewal months from the file', () => {
    const short = person('co', 'p', { identity: { passportExpiry: '2027-04-01' } });
    expect(passportValidity(short, srtip, FEDERAL, TODAY, 'new')).toEqual({
      ok: false,
      requiredMonths: 8,
      requiredUntil: '2027-05-12',
    });
    expect(passportValidity(short, srtip, FEDERAL, TODAY, 'renewal')).toEqual({
      ok: true,
      requiredMonths: 6,
      requiredUntil: '2027-03-12',
    });
    expect(passportValidity(short, mainland, FEDERAL, TODAY, 'new').ok).toBe(true);
  });

  it('is null without the file value or the passport date', () => {
    expect(
      passportValidity(person('co', 'p'), emptyAuthority('srtip'), FEDERAL, TODAY, 'new').ok,
    ).toBeNull();
    const none = person('co', 'p', { identity: { passportExpiry: null } });
    expect(passportValidity(none, srtip, FEDERAL, TODAY, 'renewal').ok).toBeNull();
  });
});
