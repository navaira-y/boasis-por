import type { Document, DocumentType, Person } from '@boasis/schema';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { CheckIcon } from '../components/shared/icons';
import { DateField, Field, Picker, Sheet } from '../components';
import { screens } from '../copy/en';
import { queryKeys, useRepos } from '../data';
import type { NewRecord } from '../data';
import {
  DOCUMENT_TYPES,
  PERSON_DOCUMENT_TYPES,
  documentTypeLabel,
  isPersonType,
  personDateFor,
  withPersonDate,
} from '../lib/documents';
import { todayIso } from '../lib/today';
import { IconUpload } from './icons';
import './Documents.css';

const copy = screens.documents;

export interface UploadSheetProps {
  readonly open: boolean;
  readonly companyId: string;
  readonly companyName: string;
  readonly people: readonly Person[];
  // Opened from a person's page: the paper is theirs and the list narrows to their papers.
  readonly forPerson?: Person | null;
  readonly onClose: () => void;
  readonly onSaved: (document: Document) => void;
}

// Lite's upload sheet, ported (src/sheets/UploadSheet.jsx): the file, what it is, whose it is,
// and the date on it. The mock keeps the name, type and dates; no file bytes are stored.
export function UploadSheet({
  open,
  companyId,
  companyName,
  people,
  forPerson = null,
  onClose,
  onSaved,
}: UploadSheetProps) {
  const repos = useRepos();
  const queryClient = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // Opened from a person's page, the screen knows whose paper it is and guesses which: when
  // the passport date is missing it is almost always the passport being filed.
  const firstType: DocumentType =
    forPerson === null
      ? 'licence'
      : forPerson.identity.passportExpiry === null
        ? 'passport'
        : 'visa';
  const [type, setType] = useState<DocumentType>(firstType);
  const [personId, setPersonId] = useState<string>(forPerson?.id ?? '');
  const [expiresOn, setExpiresOn] = useState(() =>
    forPerson === null ? '' : (personDateFor(forPerson, firstType) ?? ''),
  );
  const [issuedOn, setIssuedOn] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const personal = isPersonType(type);
  const person = people.find((entry) => entry.id === personId) ?? null;

  // Picking a person fills in the date already held for them, so the two cannot drift apart.
  const choose = (nextType: DocumentType, nextPersonId: string) => {
    setType(nextType);
    setPersonId(nextPersonId);
    const chosen = people.find((entry) => entry.id === nextPersonId);
    setExpiresOn(
      isPersonType(nextType) && chosen !== undefined ? (personDateFor(chosen, nextType) ?? '') : '',
    );
  };

  const ready = fileName !== null && (!personal || personId !== '');

  const submit = () => {
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    setError('');
    const today = todayIso();
    const record: NewRecord<Document> = {
      companyId,
      personId: personal ? personId : null,
      type,
      title: fileName,
      issueDate: issuedOn === '' ? null : issuedOn,
      expiryDate: expiresOn === '' ? null : expiresOn,
      fileName,
      uploadedOn: today,
      version: 1,
    };
    repos.documents
      .create(record)
      .then(async (saved) => {
        // A date read off somebody's paper belongs on that person, not only on the file.
        if (person !== null && expiresOn !== '' && personDateFor(person, type) !== expiresOn) {
          await repos.people.update(person.id, withPersonDate(person, type, expiresOn));
          await queryClient.invalidateQueries({ queryKey: queryKeys.people(companyId) });
          await queryClient.invalidateQueries({ queryKey: queryKeys.person(person.id) });
        }
        await queryClient.invalidateQueries({ queryKey: queryKeys.documents(companyId) });
        setBusy(false);
        onSaved(saved);
        onClose();
      })
      .catch((failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      });
  };

  const types = forPerson === null ? DOCUMENT_TYPES : PERSON_DOCUMENT_TYPES;

  return (
    <Sheet
      open={open}
      kicker={companyName}
      title={copy.add}
      subtitle={copy.addNote}
      onClose={onClose}
      className="upload"
      footer={
        <button type="button" className="p" onClick={submit} disabled={!ready || busy}>
          {busy ? copy.uploading : copy.fileIt}
        </button>
      }
    >
      <div className="pg form">
        <button
          type="button"
          className={`drop${fileName !== null ? ' has' : ''}`}
          onClick={() => picker.current?.click()}
        >
          <span className="ic">{fileName !== null ? <CheckIcon /> : <IconUpload size={19} />}</span>
          <span className="bd">
            <span className="t">{fileName ?? copy.chooseFile}</span>
            <span className="s">{fileName !== null ? copy.replace : copy.chooseNote}</span>
          </span>
        </button>
        <input
          ref={picker}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
          hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            setFileName(file === undefined ? null : file.name);
            setError('');
          }}
        />

        <div className="fgrp">
          <Field label={copy.whatIsIt} htmlFor="upload-type" className="fk-field">
            <Picker
              id="upload-type"
              label={copy.whatIsIt}
              value={type}
              options={types.map((value) => ({ value, label: documentTypeLabel(value) }))}
              onChange={(next) => {
                choose(next, forPerson === null ? '' : personId);
              }}
            />
          </Field>
        </div>

        {personal ? (
          <div className="fgrp">
            {people.length === 0 ? (
              <>
                <div className="fk">{copy.whose}</div>
                <div className="fnote warn">{copy.noPeople}</div>
              </>
            ) : (
              <Field label={copy.whose} htmlFor="upload-person" className="fk-field">
                <Picker
                  id="upload-person"
                  label={copy.whose}
                  value={personId === '' ? null : personId}
                  placeholder={copy.choosePerson}
                  options={people.map((entry) => ({
                    value: entry.id,
                    label: entry.identity.name,
                    note: entry.identity.role === '' ? undefined : entry.identity.role,
                  }))}
                  onChange={(next) => {
                    choose(type, next);
                  }}
                />
              </Field>
            )}
          </div>
        ) : null}

        <div className="fgrp">
          <DateField
            id="upload-expiry"
            label={copy.expiryOnIt}
            value={expiresOn}
            help={personal ? copy.fromThePerson : copy.becomesADate}
            onChange={setExpiresOn}
            className="fk-field"
          />
        </div>

        <div className="fgrp">
          <DateField
            id="upload-issue"
            label={copy.issuedOnIt}
            value={issuedOn}
            onChange={setIssuedOn}
            className="fk-field"
          />
        </div>

        {error !== '' ? (
          <div className="ferr" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
