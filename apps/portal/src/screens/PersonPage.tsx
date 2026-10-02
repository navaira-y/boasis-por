import { daysUntil } from '@boasis/rules';
import type { Person } from '@boasis/schema';
import type { StageCheck } from '@boasis/rules';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronIcon } from '../components/shared/icons';
import { useAuthorityFile } from '../content/hooks';
import { screens } from '../copy/en';
import { useCompany, useDocuments, usePeople, usePerson } from '../data';
import { daysLine, formatLong, formatShort } from '../lib/dates';
import { documentTypeLabel } from '../lib/documents';
import { personFlags, stagesOf } from '../lib/people';
import { todayIso } from '../lib/today';
import { IconDoc, IconPen, IconPlus } from './icons';
import { PersonForm } from './PersonForm';
import { UploadSheet } from './UploadSheet';
import './lite.css';
import './People.css';

const copy = screens.people;

// Spec 6.2: what the stage's own clock says, in the row language of lite's steps.
function stageLine(check: StageCheck, today: string): { text: string; tone: string } {
  if (!check.applies) {
    return { text: copy.stageNotApplicable, tone: '' };
  }
  if (check.blocked) {
    return { text: copy.stageBlocked, tone: 'bad' };
  }
  if (check.unknown) {
    return { text: copy.stageUnknown, tone: '' };
  }
  // A stage behind the person reads done, even while a clock it started still runs.
  if (check.position === 'done') {
    return { text: copy.stageDone, tone: '' };
  }
  if (check.dueOn !== null) {
    const days = daysUntil(check.dueOn, today);
    return { text: copy.stageBy(formatShort(check.dueOn)), tone: days < 30 ? 'soon' : '' };
  }
  return { text: check.position === 'current' ? copy.stageCurrent : copy.stagePending, tone: '' };
}

// Screen 7 (spec 14): lite's person card (src/sheets/VisaSheet.jsx) as a page, with the ten
// stages of spec 6.2 and the papers filed against the person.
export function PersonPage() {
  const { id = '', personId = '' } = useParams();
  const navigate = useNavigate();
  const company = useCompany(id);
  const person = usePerson(personId);
  const people = usePeople(id);
  const documents = useDocuments(id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const authorityQuery = useAuthorityFile(company.data?.identity.authority ?? null);
  const today = todayIso();

  if (person.isPending || company.isPending || authorityQuery.isPending) {
    return (
      <p className="status" role="status">
        {screens.common.loading}
      </p>
    );
  }
  const record: Person | null = person.data ?? null;
  const facts = company.data ?? null;
  if (record === null || facts === null) {
    return <p role="alert">Nothing here</p>;
  }

  const authority = authorityQuery.data ?? null;
  const flags = personFlags(record, authority, today);
  const papers = (documents.data ?? [])
    .filter((document) => document.personId === record.id)
    .sort((a, b) => b.uploadedOn.localeCompare(a.uploadedOn));
  const stages =
    authority === null ? null : stagesOf(record, authority, documents.data ?? [], today);
  const expiry = record.status.visaExpiry;
  const passportOn = record.identity.passportExpiry;
  const insuranceOn = record.cover.healthInsurance?.endDate ?? null;
  const facts2: [string, string][] = [
    [copy.job, record.identity.role],
    [copy.nationality, record.identity.nationality],
    [copy.emiratesId, record.status.emiratesIdNumber ?? ''],
  ].filter((pair): pair is [string, string] => pair[1] !== '');

  return (
    <div className="pg person">
      <button
        type="button"
        className="back"
        onClick={() => {
          void navigate(`/companies/${id}/people`);
        }}
      >
        <ChevronIcon className="rev" width="15" height="15" />
        {copy.title}
      </button>

      {editing ? (
        <PersonForm
          person={record}
          companyId={id}
          onDone={() => {
            setEditing(false);
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      ) : null}

      <div className="card">
        <div className="sh">
          <div className="k">{copy.title}</div>
          <h3>{record.identity.name}</h3>
          <div className="due">
            {expiry !== null ? (
              <>
                <b>{formatLong(expiry)}</b>
                <span>{daysLine(expiry, today)}</span>
              </>
            ) : (
              <span>{screens.common.noDate}</span>
            )}
          </div>
        </div>

        <div className="sb">
          {flags.passport === 'blocks' && passportOn !== null ? (
            <div className="blk">
              <div className="note bad">
                <p>{copy.passportBlocks(formatLong(passportOn))}</p>
              </div>
            </div>
          ) : null}
          {flags.insurance === 'blocks' && insuranceOn !== null ? (
            <div className="blk">
              <div className="note bad">
                <p>{copy.insuranceBlocksLong(formatLong(insuranceOn))}</p>
              </div>
            </div>
          ) : null}

          <div className="blk">
            <div className="k">{copy.passportExpires}</div>
            <p>
              {passportOn !== null ? formatLong(passportOn) : copy.noPassport}
              {passportOn !== null && flags.passport === null ? (
                <em className="okline">{copy.passportFine}</em>
              ) : null}
              {passportOn === null ? <em className="okline">{copy.passportMissingWhy}</em> : null}
            </p>
          </div>

          <div className="blk">
            <div className="k">{copy.insuranceExpires}</div>
            <p>
              {insuranceOn !== null ? formatLong(insuranceOn) : copy.noInsurance}
              {insuranceOn !== null && flags.insurance === null ? (
                <em className="okline">{copy.insuranceFine}</em>
              ) : null}
              {insuranceOn === null ? <em className="okline">{copy.insuranceMissingWhy}</em> : null}
            </p>
          </div>

          <div className="blk">
            <div className="k">{copy.stages}</div>
            {stages === null ? (
              <p className="quiet">{copy.stageUnknown}</p>
            ) : (
              <ol className="stages">
                {stages.chain.map((check, index) => {
                  const line = stageLine(check, today);
                  return (
                    <li
                      key={check.stage}
                      className={`${check.position}${check.applies ? '' : ' off'}`}
                    >
                      <span className="n">{index + 1}</span>
                      <span className="bd">
                        <span className="t">{check.title}</span>
                        <span className="s">{check.note}</span>
                      </span>
                      <span className={`st${line.tone === '' ? '' : ` ${line.tone}`}`}>
                        {line.text}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="blk">
            <div className="k">{copy.papers}</div>
            {papers.length === 0 ? <p className="quiet">{copy.noPapers}</p> : null}
            <div className="papers">
              <button
                type="button"
                className="addpaper"
                onClick={() => {
                  setAdding(true);
                }}
              >
                <span className="pv">
                  <IconPlus size={16} />
                </span>
                <span className="bd">
                  <span className="t">{copy.addPaper}</span>
                </span>
              </button>
              {papers.map((document) => (
                <div key={document.id} className="paper">
                  <span className="pv">
                    <IconDoc size={18} />
                  </span>
                  <span className="bd">
                    <span className="t">{documentTypeLabel(document.type)}</span>
                    <span className="s">
                      {screens.documents.uploadedOn(formatShort(document.uploadedOn))}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {facts2.length > 0 ? (
            <div className="blk">
              <div className="k">{copy.about}</div>
              <ul className="pairs">
                {facts2.map(([label, value]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <b>{value}</b>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="sf">
          <button
            type="button"
            className="p"
            onClick={() => {
              setEditing(true);
            }}
          >
            <IconPen size={16} />
            {screens.common.edit}
          </button>
        </div>
      </div>

      <UploadSheet
        open={adding}
        companyId={id}
        companyName={facts.identity.tradeName}
        people={people.data ?? []}
        forPerson={record}
        onClose={() => {
          setAdding(false);
        }}
        onSaved={() => undefined}
      />
    </div>
  );
}
