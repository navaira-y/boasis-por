import type { Card, DocumentType, Evidence } from '@boasis/schema';
import { useRef, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { DateField, TextField } from '../../components/Field/Field';
import { Sheet } from '../../components/Sheet/Sheet';
import { cx } from '../../components/shared/cx';
import { en } from '../../copy/en';
import { useRefresh } from '../../data/bundles';
import { useRepos } from '../../data/ReposProvider';
import { howWorkedOut, type Entry } from '../../lib/entries';
import { formatLong, plural } from '../../lib/format';
import { IconCheck, IconUpload } from '../../lib/icons';
import { today } from '../../lib/today';
import './sheets.css';

// Which document a date produces. Ticking the renewal done and attaching the new licence is the
// moment the vault fills itself, without anyone thinking of it as filing.
const PROOF_TYPE: Readonly<Record<string, DocumentType>> = {
  'licence-renewal': 'licence',
  'immigration-card-renewal': 'establishment-card',
  'mohre-card-renewal': 'establishment-card',
  'e-signature-card-renewal': 'e-signature-card',
  'chamber-renewal': 'chamber-certificate',
  'office-lease-renewal': 'lease',
  'ejari-renewal': 'ejari-certificate',
  'rent-instalment': 'deposit-receipt',
  'audited-accounts': 'audited-accounts',
  'corporate-tax-return': 'corporate-tax-return',
  'corporate-tax-registration': 'tax-certificate',
  'vat-return': 'vat-return',
  'vat-registration': 'tax-certificate',
  'ubo-declaration': 'ubo-declaration',
  'ubo-confirmation': 'ubo-declaration',
  'ownership-change': 'ubo-declaration',
  'health-insurance-policy': 'insurance-policy',
  'health-insurance-renewal': 'insurance-policy',
  'residence-visa-renewal': 'visa',
  'emirates-id-renewal': 'emirates-id',
  'work-permit-renewal': 'work-permit',
  'passport-expiry': 'passport',
  'labour-contract-registered': 'labour-contract',
  'unemployment-insurance': 'unemployment-insurance-certificate',
  'wages-pay-date': 'wages-file',
  'send-licence-to-bank': 'bank-letter',
  'bank-kyc-refresh': 'bank-letter',
  'general-assembly': 'board-resolution',
  'cancellation-certificate': 'cancellation-certificate',
};

function proofTypeOf(entry: Entry): DocumentType {
  const known = PROOF_TYPE[entry.card.requirementId];
  if (known !== undefined) {
    return known;
  }
  switch (entry.family) {
    case 'tax':
      return 'tax-receipt';
    case 'visa':
      return 'visa';
    case 'licence':
      return 'licence';
    case 'other':
      return 'deposit-receipt';
  }
}

export interface DeadlineSheetProps {
  readonly open: boolean;
  readonly entry: Entry;
  readonly showCompany: boolean;
  readonly onClose: () => void;
}

// One date, and the button that keeps the whole product honest. Without "I have done this", on
// 1 October the return filed yesterday is still on the timeline and the reminders keep coming.
// Spec 7.3: the last step always asks for the evidence, the new document or a reference number
// and date; nobody closes a card without one.
export function DeadlineSheet({ open, entry, showCompany, onClose }: DeadlineSheetProps) {
  const repos = useRepos();
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [reference, setReference] = useState('');
  const [referenceDate, setReferenceDate] = useState('');
  const [error, setError] = useState('');
  const picker = useRef<HTMLInputElement>(null);
  const { days, date, status } = entry;
  const done = status === 'done';
  // "Done on" means the day it was ticked, not the day it was due.
  const doneOn = entry.card.steps.find((step) => step.done)?.doneOn ?? date;
  const lines = howWorkedOut(entry);

  const kicker = done
    ? en.obligation.doneOn.replace('{date}', formatLong(doneOn))
    : showCompany
      ? `${entry.companyName} · ${days <= 30 ? en.deadline.dueSoonLower : en.deadline.aheadLower}`
      : days <= 30
        ? en.deadline.dueSoon
        : en.deadline.ahead;
  const due = done
    ? formatLong(date)
    : `${formatLong(date)} · ${plural(days, en.units.inDays.one, en.units.inDays.other)}`;

  const hasEvidence = proof !== null || (reference.trim() !== '' && referenceDate !== '');

  async function tick() {
    setBusy(true);
    setError('');
    const day = today();
    try {
      if (done) {
        const reopened: Card = {
          ...entry.card,
          state: 'on-track',
          steps: entry.card.steps.map((step) => ({ ...step, done: false, doneOn: null })),
        };
        await repos.cards.put(reopened);
      } else {
        // The document first: if it cannot be saved, nothing is ticked.
        let evidence: Evidence;
        if (proof !== null) {
          const document = await repos.documents.create({
            companyId: entry.company.id,
            personId: entry.person?.id ?? null,
            type: proofTypeOf(entry),
            title: proof.name,
            issueDate: null,
            expiryDate: null,
            fileName: proof.name,
            uploadedOn: day,
            version: 1,
          });
          evidence = { kind: 'document', documentId: document.id };
        } else {
          evidence = { kind: 'reference', reference: reference.trim(), date: referenceDate };
        }
        const steps =
          entry.card.steps.length === 0
            ? [
                {
                  id: 'done',
                  title: en.obligation.markDone,
                  done: true,
                  doneOn: day,
                  assigneeId: null,
                },
              ]
            : entry.card.steps.map((step) => ({ ...step, done: true, doneOn: step.doneOn ?? day }));
        const closed: Card = {
          ...entry.card,
          state: 'complete',
          steps,
          evidence: [...entry.card.evidence, evidence],
        };
        await repos.cards.put(closed);
      }
      await refresh();
      setBusy(false);
      onClose();
    } catch (failure: unknown) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <Sheet
      open={open}
      title={entry.title}
      kicker={kicker}
      subtitle={due}
      onClose={onClose}
      footer={
        <Button
          variant={done ? 'secondary' : 'primary'}
          onClick={() => {
            void tick();
          }}
          disabled={busy || (!done && !hasEvidence)}
          loading={busy}
        >
          {busy
            ? proof !== null
              ? en.documents.uploading
              : en.obligation.marking
            : done
              ? en.obligation.undo
              : en.obligation.markDone}
        </Button>
      }
    >
      <div className="sheet-blk">
        <div className="sheet-k">{en.deadline.whatThisIs}</div>
        <p className="sheet-p">{entry.subtitle}</p>
      </div>

      {lines.length > 0 ? (
        <div className="sheet-blk">
          <div className="sheet-k">{en.obligation.howWorkedOut}</div>
          {lines.map((line) => (
            <p key={line} className="sheet-p">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {done ? null : (
        <>
          {/* The vault fills itself here. Spec 7.3: the document, or a reference and a date. */}
          <div className="sheet-blk">
            <div className="sheet-k">{en.documents.attach}</div>
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
                setError('');
              }}
            />
          </div>

          {proof === null ? (
            <div className="sheet-blk">
              <div className="sheet-k">{en.documents.reference}</div>
              <div className="fgrp">
                <TextField
                  label={en.documents.referenceField}
                  value={reference}
                  onChange={setReference}
                  help={en.documents.referenceNote}
                />
                <DateField
                  label={en.documents.referenceDate}
                  value={referenceDate}
                  onChange={setReferenceDate}
                />
              </div>
            </div>
          ) : null}

          <div className="sheet-blk">
            <div className="sheet-note">
              <p>{hasEvidence ? en.obligation.nextOne : en.obligation.needsEvidence}</p>
            </div>
          </div>
        </>
      )}

      {error !== '' ? <div className="sheet-ferr">{error}</div> : null}
    </Sheet>
  );
}
