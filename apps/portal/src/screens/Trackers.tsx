import { daysUntil } from '@boasis/rules';
import type { Card, Evidence, Step } from '@boasis/schema';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button/Button';
import { DateField, TextField } from '../components/Field/Field';
import { cx } from '../components/shared/cx';
import { StatePill } from '../components/StatePill/StatePill';
import { compliance, screens } from '../copy/en';
import { useCompanyData, useRefresh } from '../data/bundles';
import { useRepos } from '../data/ReposProvider';
import {
  cardTitle,
  requirementOf,
  playbookSource,
  playbookSteps,
  TRACKER_IDS,
  TRACKER_PLAYBOOK,
  trackerFor,
  type TrackerId,
} from '../lib/cards';
import { daysLabel } from '../lib/entries';
import { formatLong } from '../lib/format';
import { IconCheck, IconChevron } from '../lib/icons';
import { NotFound } from './NotFound';
import './lite.css';
import './compliance.css';

const copy = compliance.tracker;

function isTrackerId(value: string): value is TrackerId {
  return (TRACKER_IDS as readonly string[]).includes(value);
}

// The card whose steps and references a tracker writes to: the licence card for a renewal,
// the cancellation certificate card for a cancellation, the open change card for an amendment.
function anchorOf(tracker: TrackerId, cards: readonly Card[]): Card | null {
  const open = cards.filter((card) => card.state !== 'complete');
  switch (tracker) {
    case 'renewal':
      return open.find((card) => card.requirementId === 'licence-renewal') ?? null;
    case 'cancellation':
      return (
        open.find((card) => card.requirementId === 'cancellation-certificate') ??
        open.find((card) => requirementOf(card)?.group === 'exit') ??
        null
      );
    case 'amendment':
      return open.find((card) => requirementOf(card)?.group === 'change') ?? null;
  }
}

// Screen 14 (spec 14): renewal, cancellation and amendment as step lists with clocks and
// references. Same layout, different steps: the steps are the authority file's playbook, or
// "unknown" where the file has none; the clocks are the cards packages/rules runs for the
// sequence; ticks and references are kept on the card the sequence closes.
export function Trackers() {
  const { id = '', trackerId = '' } = useParams();
  const navigate = useNavigate();
  const repos = useRepos();
  const refresh = useRefresh();
  const data = useCompanyData(id);
  const [reference, setReference] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (data.error !== null) {
    return <p role="alert">{data.error.message}</p>;
  }
  if (data.view === null) {
    return (
      <p className="status" role="status">
        {screens.common.loading}
      </p>
    );
  }
  if (data.view === undefined || !isTrackerId(trackerId)) {
    return <NotFound />;
  }
  const { bundle } = data.view;
  const day = data.today;
  const tracker: TrackerId = trackerId;
  const playbookId = TRACKER_PLAYBOOK[tracker];
  const fileSteps = playbookSteps(bundle.authority, playbookId);
  const source = playbookSource(bundle.authority, playbookId);
  const clocks = bundle.cards.filter((card) => {
    const requirement = requirementOf(card);
    return requirement !== null && trackerFor(requirement) === tracker;
  });
  const anchor = anchorOf(tracker, bundle.cards);
  const steps: Step[] =
    anchor !== null && anchor.steps.length > 0
      ? anchor.steps
      : (fileSteps ?? []).map((title, index) => ({
          id: `step-${String(index + 1)}`,
          title,
          done: false,
          doneOn: null,
          assigneeId: null,
        }));

  async function write(next: Card) {
    setBusy(true);
    setError('');
    try {
      await repos.cards.put(next);
      await refresh();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    setBusy(false);
  }

  const tick = (step: Step) => {
    if (anchor === null) {
      return;
    }
    const updated = steps.map((entry) =>
      entry.id === step.id
        ? { ...entry, done: !entry.done, doneOn: entry.done ? null : day }
        : entry,
    );
    void write({ ...anchor, steps: updated });
  };

  const log = () => {
    if (anchor === null || reference.trim() === '' || referenceDate === '') {
      return;
    }
    const evidence: Evidence = {
      kind: 'reference',
      reference: reference.trim(),
      date: referenceDate,
    };
    setReference('');
    setReferenceDate('');
    void write({ ...anchor, evidence: [...anchor.evidence, evidence] });
  };

  return (
    <div className="pg tracker">
      <button
        type="button"
        className="back"
        onClick={() => {
          void navigate(`/companies/${id}/compliance`);
        }}
      >
        <IconChevron className="rev" size={15} />
        {bundle.facts.identity.tradeName}
      </button>

      <div className="card">
        <div className="sh">
          <div className="k">
            {copy.kicker} · {bundle.facts.identity.tradeName}
          </div>
          <h3>{copy[tracker]}</h3>
          <div className="cpage__links">
            {TRACKER_IDS.filter((other) => other !== tracker).map((other) => (
              <Link key={other} className="cpage__link" to={`/companies/${id}/trackers/${other}`}>
                {copy[other]}
              </Link>
            ))}
          </div>
        </div>

        <div className="sb">
          <div className="blk">
            <div className="k">{copy.clocks}</div>
            {clocks.length === 0 ? (
              <p>{copy.noClocks}</p>
            ) : (
              <ul className="lines">
                {clocks.map((card) => {
                  const days = card.dueOn === null ? null : daysUntil(card.dueOn, day);
                  return (
                    <li key={card.id}>
                      <span className="lines__k">
                        <Link
                          className="cgroup__link"
                          to={`/companies/${id}/compliance/${encodeURIComponent(card.id)}`}
                        >
                          {cardTitle(card, bundle)}
                        </Link>
                        <span className="lines__s">
                          <StatePill state={card.state} size="sm" />
                        </span>
                      </span>
                      <span
                        className={cx(
                          'lines__v',
                          days === null && 'lines__v--unknown',
                          days !== null && days < 0 && 'lines__v--late',
                          days !== null && days >= 0 && days < 30 && 'lines__v--soon',
                        )}
                      >
                        {card.dueOn === null ? copy.unknownClock : formatLong(card.dueOn)}
                        {days === null ? null : <span className="lines__s">{daysLabel(days)}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="blk">
            <div className="k">{copy.steps}</div>
            {steps.length === 0 ? (
              <p>{copy.noSteps}</p>
            ) : (
              <ul className="steps">
                {steps.map((step) => (
                  <li key={step.id} className={cx('step', step.done && 'step--done')}>
                    <button
                      type="button"
                      className={cx('step__tick', step.done && 'step__tick--on')}
                      aria-pressed={step.done}
                      aria-label={step.title}
                      disabled={busy || anchor === null}
                      onClick={() => {
                        tick(step);
                      }}
                    >
                      {step.done ? <IconCheck size={14} /> : null}
                    </button>
                    <span className="step__body">
                      <span className="step__title">{step.title}</span>
                      {step.done && step.doneOn !== null ? (
                        <span className="step__meta">
                          {compliance.card.stepDone} {formatLong(step.doneOn)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {source !== null && fileSteps !== null ? (
              <p className="hintline">
                {compliance.card.stepsSource}: {source}
              </p>
            ) : null}
            {anchor === null && steps.length > 0 ? (
              <p className="hintline">{copy.notOpen}</p>
            ) : null}
          </div>

          {anchor !== null ? (
            <div className="blk">
              <div className="k">{compliance.card.reference}</div>
              {anchor.evidence.length > 0 ? (
                <ul className="lines">
                  {anchor.evidence.map((item, index) =>
                    item.kind === 'reference' ? (
                      <li key={`${item.reference}-${String(index)}`}>
                        <span className="lines__k">{item.reference}</span>
                        <span className="lines__v">{formatLong(item.date)}</span>
                      </li>
                    ) : null,
                  )}
                </ul>
              ) : null}
              <div className="fgrp" style={{ marginBlockStart: 10 }}>
                <TextField
                  label={compliance.card.referenceField}
                  value={reference}
                  onChange={setReference}
                  help={compliance.card.referenceNote}
                />
                <div className="pair2">
                  <DateField
                    label={compliance.card.referenceDate}
                    value={referenceDate}
                    onChange={setReferenceDate}
                  />
                  <Button
                    onClick={log}
                    disabled={busy || reference.trim() === '' || referenceDate === ''}
                  >
                    {compliance.card.logIt}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {error !== '' ? (
            <div className="ferr" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
