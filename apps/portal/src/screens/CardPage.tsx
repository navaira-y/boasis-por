import { daysUntil, decisionNeeded, decisionPoint, nextOccurrence } from '@boasis/rules';
import type { Card, Evidence, Step } from '@boasis/schema';
import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button/Button';
import { DateField, TextField } from '../components/Field/Field';
import { Picker } from '../components/Picker/Picker';
import { cx } from '../components/shared/cx';
import { StatePill } from '../components/StatePill/StatePill';
import { libraryAuthorityFor } from '../content/content';
import { useAuthorityFile } from '../content/hooks';
import { compliance, en, screens } from '../copy/en';
import { useAccessGrants } from '../data/hooks';
import { useCompanyData, useRefresh } from '../data/bundles';
import { useRepos } from '../data/ReposProvider';
import {
  cardTitle,
  requirementOf,
  libraryEntryIdFor,
  membersOf,
  playbookIdFor,
  playbookSource,
  playbookSteps,
  proofTypeOf,
  responsibleOf,
  subjectOf,
  trackerFor,
} from '../lib/cards';
import { documentTypeLabel } from '../lib/documents';
import { formatLong, plural } from '../lib/format';
import { IconCheck, IconChevron, IconUpload } from '../lib/icons';
import { NotFound } from './NotFound';
import './lite.css';
import './compliance.css';

const copy = compliance.card;
const NOBODY = 'nobody';

// Screen 10 (spec 14): what to do next for one card. The requirement, the days, the act-by date,
// who is responsible, the playbook steps of the authority file with a tick and an assignee each,
// the documents the requirement needs, the fee and the library line, a reference log, and the close
// that asks for its evidence (spec 7.3) and stores the next occurrence. Lite's sheet, as a page.
export function CardPage() {
  const { id = '', cardId = '' } = useParams();
  const navigate = useNavigate();
  const repos = useRepos();
  const refresh = useRefresh();
  const data = useCompanyData(id);
  const grants = useAccessGrants();
  const libraryFile = useAuthorityFile(
    data.view === null || data.view === undefined
      ? null
      : libraryAuthorityFor(data.view.bundle.authority.id),
  );
  const [reference, setReference] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [closeReference, setCloseReference] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closedNote, setClosedNote] = useState<'next' | 'final' | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  if (data.error !== null) {
    return <p role="alert">{data.error.message}</p>;
  }
  if (data.view === null || grants.isPending) {
    return (
      <p className="status" role="status">
        {screens.common.loading}
      </p>
    );
  }
  if (data.view === undefined) {
    return <NotFound />;
  }
  const { bundle } = data.view;
  const card = bundle.cards.find((candidate) => candidate.id === cardId);
  if (card === undefined) {
    return <NotFound />;
  }
  const day = data.today;
  const requirement = requirementOf(card);
  const subject = subjectOf(card, bundle);
  const allGrants = grants.data ?? [];
  const responsible = responsibleOf(card, allGrants);
  const members = membersOf(allGrants, id);
  const done = card.state === 'complete';

  // The steps: what is stored on the card, else the authority file's playbook, else unknown.
  const playbookId = requirement === null ? null : playbookIdFor(requirement);
  const fileSteps = playbookSteps(bundle.authority, playbookId);
  const source = playbookSource(bundle.authority, playbookId);
  const steps: Step[] =
    card.steps.length > 0
      ? card.steps
      : (fileSteps ?? []).map((title, index) => ({
          id: `step-${String(index + 1)}`,
          title,
          done: false,
          doneOn: null,
          assigneeId: null,
        }));

  const proofType = proofTypeOf(requirement);
  const proofs =
    proofType === null
      ? []
      : bundle.documents.filter(
          (document) =>
            document.type === proofType &&
            (subject.person === null
              ? document.personId === null
              : document.personId === subject.person.id),
        );

  const fees =
    requirement?.key === 'licence-renewal' ? (bundle.authority.licence.fees ?? null) : null;
  const ifMissed =
    requirement?.key === 'licence-renewal'
      ? (bundle.authority.licence.lateRenewalFine ?? null)
      : null;
  const libraryAuthority = libraryFile.data ?? null;
  const entryId =
    requirement === null || libraryAuthority === null
      ? null
      : libraryEntryIdFor(libraryAuthority, requirement);
  const tracker = requirement === null ? null : trackerFor(requirement);
  const point = decisionPoint(bundle.facts, bundle.authority, day, bundle.documents);
  const showDecision = requirement?.key === 'licence-renewal' && decisionNeeded(point);

  const days = card.dueOn === null ? null : daysUntil(card.dueOn, day);
  const daysText =
    days === null
      ? copy.noDate
      : days < 0
        ? plural(-days, copy.daysLate.one, copy.daysLate.other)
        : plural(days, copy.daysLeft.one, copy.daysLeft.other);

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
    const updated = steps.map((entry) =>
      entry.id === step.id
        ? { ...entry, done: !entry.done, doneOn: entry.done ? null : day }
        : entry,
    );
    void write({ ...card, steps: updated });
  };

  const assign = (step: Step, assigneeId: string | null) => {
    const updated = steps.map((entry) => (entry.id === step.id ? { ...entry, assigneeId } : entry));
    void write({ ...card, steps: updated });
  };

  const logReference = () => {
    if (reference.trim() === '' || referenceDate === '') {
      return;
    }
    const evidence: Evidence = {
      kind: 'reference',
      reference: reference.trim(),
      date: referenceDate,
    };
    setReference('');
    setReferenceDate('');
    void write({ ...card, evidence: [...card.evidence, evidence] });
  };

  const canClose = proof !== null || (closeReference.trim() !== '' && closeDate !== '');

  // Spec 7.3: the last step asks for the evidence; closing stores the next occurrence.
  async function close() {
    if (card === undefined || !canClose) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      let evidence: Evidence;
      const documents = [...bundle.documents];
      if (proof !== null) {
        const document = await repos.documents.create({
          companyId: bundle.facts.id,
          personId: subject.person?.id ?? null,
          type: proofType ?? 'deposit-receipt',
          title: proof.name,
          issueDate: day,
          expiryDate: null,
          fileName: proof.name,
          uploadedOn: day,
          version: 1,
        });
        documents.push(document);
        evidence = { kind: 'document', documentId: document.id };
      } else {
        evidence = { kind: 'reference', reference: closeReference.trim(), date: closeDate };
      }
      const closedSteps =
        steps.length === 0
          ? [
              {
                id: 'done',
                title: en.obligation.markDone,
                done: true,
                doneOn: day,
                assigneeId: null,
              },
            ]
          : steps.map((step) => ({ ...step, done: true, doneOn: step.doneOn ?? day }));
      const closed: Card = {
        ...card,
        state: 'complete',
        steps: closedSteps,
        evidence: [...card.evidence, evidence],
      };
      await repos.cards.put(closed);
      const next = nextOccurrence(closed, evidence, { documents, today: day, holidays: [] });
      if (next !== null) {
        await repos.cards.put(next);
      }
      await refresh();
      setClosedNote(next === null ? 'final' : 'next');
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    setBusy(false);
  }

  const assignee = (step: Step) =>
    step.assigneeId === null
      ? null
      : (allGrants.find((grant) => grant.id === step.assigneeId)?.member.name ?? null);

  return (
    <div className="pg cpage">
      <button
        type="button"
        className="back"
        onClick={() => {
          void navigate(`/companies/${id}/compliance`);
        }}
      >
        <IconChevron className="rev" size={15} />
        {copy.back}
      </button>

      <div className="card">
        <div className="sh">
          <div className="cpage__kicker">
            <span className="k">{bundle.facts.identity.tradeName}</span>
            <StatePill state={card.state} size="sm" />
          </div>
          <h3>{cardTitle(card, bundle)}</h3>
          <div className="due">
            <b>{card.dueOn === null ? copy.noDate : formatLong(card.dueOn)}</b>
            {card.dueOn === null ? null : <span>{daysText}</span>}
          </div>
          {card.actBy != null && card.actBy !== card.dueOn ? (
            <p className="cpage__actby">
              {copy.actBy(formatLong(card.actBy))}. {copy.actByNote}
            </p>
          ) : null}
          <div className="cpage__links">
            {subject.person !== null ? (
              <Link className="cpage__link" to={`/companies/${id}/people/${subject.person.id}`}>
                {copy.person}
              </Link>
            ) : null}
            {tracker !== null ? (
              <Link className="cpage__link" to={`/companies/${id}/trackers/${tracker}`}>
                {copy.tracker}
              </Link>
            ) : null}
            {showDecision ? (
              <Link className="cpage__link" to={`/companies/${id}/decision`}>
                {copy.decision}
              </Link>
            ) : null}
            {entryId !== null ? (
              <Link className="cpage__link" to={`/library/${entryId}`}>
                {copy.library}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="sb">
          <div className="blk">
            <div className="k">{copy.responsible}</div>
            <p>
              {responsible.name}
              {responsible.grant !== null ? (
                <span className="okline">{responsible.grant.roleName}</span>
              ) : null}
            </p>
          </div>

          <div className="blk">
            <div className="k">{copy.steps}</div>
            {steps.length === 0 ? (
              <p>{copy.stepsUnknown}</p>
            ) : (
              <ul className="steps">
                {steps.map((step) => (
                  <li key={step.id} className={cx('step', step.done && 'step--done')}>
                    <button
                      type="button"
                      className={cx('step__tick', step.done && 'step__tick--on')}
                      aria-pressed={step.done}
                      aria-label={`${step.done ? copy.stepDone : copy.stepToDo}: ${step.title}`}
                      disabled={busy || done}
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
                          {copy.stepDone} {formatLong(step.doneOn)}
                          {assignee(step) === null ? '' : ` · ${assignee(step) ?? ''}`}
                        </span>
                      ) : null}
                    </span>
                    <span className="step__assign">
                      <Picker<string>
                        label={copy.assign}
                        size="sm"
                        value={step.assigneeId ?? NOBODY}
                        disabled={busy || done}
                        options={[
                          { value: NOBODY, label: copy.nobody },
                          ...members.map((grant) => ({
                            value: grant.id,
                            label: grant.member.name,
                            note: grant.roleName,
                          })),
                        ]}
                        onChange={(value) => {
                          assign(step, value === NOBODY ? null : value);
                        }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {source !== null && steps.length > 0 && card.steps.length === 0 ? (
              <p className="hintline">
                {copy.stepsSource}: {source}
              </p>
            ) : null}
          </div>

          <div className="blk">
            <div className="k">{copy.documents}</div>
            {proofType === null ? (
              <p>{copy.documentsNone}</p>
            ) : (
              <ul className="lines">
                <li>
                  <span className="lines__k">{documentTypeLabel(proofType)}</span>
                  <span className={cx('lines__v', proofs.length === 0 && 'lines__v--unknown')}>
                    {proofs.length === 0 ? copy.missing : copy.onFile}
                  </span>
                </li>
                {proofs.map((document) => (
                  <li key={document.id}>
                    <span className="lines__k">
                      {document.title}
                      <span className="lines__s">
                        {document.expiryDate === null
                          ? screens.documents.uploadedOn(formatLong(document.uploadedOn))
                          : screens.documents.expiresOn(formatLong(document.expiryDate))}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="blk">
            <div className="k">{copy.fee}</div>
            {fees?.value == null || fees.value.length === 0 ? (
              <p>{copy.feeUnknown}</p>
            ) : (
              <ul className="lines">
                {fees.value.map((line) => (
                  <li key={line.name}>
                    <span className="lines__k">
                      {line.name}
                      <span className="src">{fees.grade}</span>
                    </span>
                    <span className="lines__v">AED {line.amountAed.toLocaleString('en-AE')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {ifMissed?.value != null ? (
            <div className="blk">
              <div className="k">{copy.ifMissed}</div>
              <p>
                {ifMissed.value}
                <span className="src">{ifMissed.grade}</span>
              </p>
            </div>
          ) : null}

          {card.evidence.length > 0 ? (
            <div className="blk">
              <div className="k">{copy.evidence}</div>
              <ul className="lines">
                {card.evidence.map((item, index) => {
                  if (item.kind === 'document') {
                    const document = bundle.documents.find((entry) => entry.id === item.documentId);
                    return (
                      <li key={`${item.documentId}-${String(index)}`}>
                        <span className="lines__k">{document?.title ?? item.documentId}</span>
                        <span className="lines__v">{copy.document}</span>
                      </li>
                    );
                  }
                  return (
                    <li key={`${item.reference}-${String(index)}`}>
                      <span className="lines__k">{item.reference}</span>
                      <span className="lines__v">{formatLong(item.date)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {done ? null : (
            <div className="blk">
              <div className="k">{copy.reference}</div>
              <div className="fgrp">
                <TextField
                  label={copy.referenceField}
                  value={reference}
                  onChange={setReference}
                  help={copy.referenceNote}
                />
                <div className="pair2">
                  <DateField
                    label={copy.referenceDate}
                    value={referenceDate}
                    onChange={setReferenceDate}
                  />
                  <Button
                    onClick={logReference}
                    disabled={busy || reference.trim() === '' || referenceDate === ''}
                  >
                    {copy.logIt}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {done ? (
            <div className="blk">
              <div className="note">
                <p>{closedNote === 'next' ? copy.closedNext : copy.closedFinal}</p>
              </div>
            </div>
          ) : (
            <div className="blk cclose">
              <div className="k">{copy.close}</div>
              <p className="quiet">{copy.closeNote}</p>
              <button
                type="button"
                className={cx('drop', proof !== null && 'drop--has')}
                onClick={() => picker.current?.click()}
              >
                <span className="drop__ic">
                  {proof !== null ? <IconCheck /> : <IconUpload size={19} />}
                </span>
                <span className="drop__bd">
                  <span className="drop__t">{proof?.name ?? en.documents.attach}</span>
                  <span className="drop__s">
                    {proof !== null ? en.documents.replace : en.documents.attachNote}
                  </span>
                </span>
              </button>
              <input
                ref={picker}
                type="file"
                accept="application/pdf,image/*"
                hidden
                onChange={(event) => {
                  setProof(event.currentTarget.files?.[0] ?? null);
                }}
              />
              {proof === null ? (
                <div className="fgrp">
                  <TextField
                    label={en.documents.referenceField}
                    value={closeReference}
                    onChange={setCloseReference}
                  />
                  <DateField
                    label={en.documents.referenceDate}
                    value={closeDate}
                    onChange={setCloseDate}
                  />
                </div>
              ) : null}
              <div className="sf">
                <button
                  type="button"
                  className="p"
                  disabled={busy || !canClose}
                  onClick={() => {
                    void close();
                  }}
                >
                  {busy ? en.obligation.marking : en.obligation.markDone}
                </button>
              </div>
            </div>
          )}

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
