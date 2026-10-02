import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { TextField } from '../../components/Field/Field';
import { Sheet } from '../../components/Sheet/Sheet';
import { en } from '../../copy/en';
import { useRefresh } from '../../data/bundles';
import { useRepos } from '../../data/ReposProvider';
import type { Bundle, Entry } from '../../lib/entries';
import { plural } from '../../lib/format';
import { PLAN } from '../../lib/plan';
import './sheets.css';

export interface DeleteCompanySheetProps {
  readonly open: boolean;
  readonly bundle: Bundle;
  readonly entries: readonly Entry[];
  readonly onClose: () => void;
  readonly onDone: () => void;
}

// Deletion is the only irreversible action in the product, so it is the one screen that slows
// you down on purpose. It says what disappears with real numbers, reminds you that UAE law wants
// business records kept for seven years, says what does NOT change, and asks you to type the
// name. Typing is the friction: a button pressed twice by reflex is how people lose things.
export function DeleteCompanySheet({
  open,
  bundle,
  entries,
  onClose,
  onDone,
}: DeleteCompanySheetProps) {
  const repos = useRepos();
  const refresh = useRefresh();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = bundle.facts.identity.tradeName;
  const upcoming = entries.filter((entry) => entry.status === 'upcoming').length;
  const done = entries.length - upcoming;
  const documents = bundle.documents.length;
  const visas = bundle.people.filter((person) => person.status.visaExpiry !== null).length;
  const people = bundle.people.length;

  // Without regard to case or spaces around: the friction has to slow, not trap.
  const matches = typed.trim().toLowerCase() === label.trim().toLowerCase();

  const lines = [
    upcoming > 0
      ? plural(upcoming, en.deleteCompany.upcoming.one, en.deleteCompany.upcoming.other)
      : null,
    done > 0 ? plural(done, en.deleteCompany.done.one, en.deleteCompany.done.other) : null,
    documents > 0
      ? plural(documents, en.deleteCompany.documents.one, en.deleteCompany.documents.other)
      : null,
    visas > 0 ? plural(visas, en.deleteCompany.visas.one, en.deleteCompany.visas.other) : null,
  ].filter((line): line is string => line !== null);

  async function confirm() {
    if (!matches || busy) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await repos.companies.remove(bundle.facts.id);
      await refresh();
      setBusy(false);
      onDone();
    } catch (failure: unknown) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return (
    <Sheet
      open={open}
      kicker={label}
      title={en.deleteCompany.title.replace('{company}', label)}
      subtitle={en.deleteCompany.sub}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {en.deadline.close}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              void confirm();
            }}
            disabled={!matches || busy}
            loading={busy}
          >
            {busy ? en.deleteCompany.deletingCompany : en.deleteCompany.confirm}
          </Button>
        </>
      }
    >
      <div className="sheet-blk">
        <div className="sheet-k">{en.deleteCompany.whatGoes}</div>
        {lines.length > 0 ? (
          <ul className="sheet-ul">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="sheet-p">{en.deleteCompany.nothingYet}</p>
        )}
      </div>

      {/* Seven years: article 56 of Federal Decree-Law 47 of 2022. Said before, not after. */}
      {documents > 0 ? (
        <div className="sheet-blk">
          <div className="sheet-note">
            <p>{en.deleteCompany.keepRecords}</p>
          </div>
        </div>
      ) : null}

      {people > 0 ? (
        <div className="sheet-blk">
          <div className="sheet-k">
            {plural(people, 'On file, {count} person', 'On file, {count} people')}
          </div>
          <ul className="pairs">
            {bundle.people.map((person) => (
              <li key={person.id}>
                <span>{person.identity.name}</span>
                <b>{person.identity.role}</b>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="sheet-blk">
        <div className="sheet-k">{en.deleteCompany.whatStays}</div>
        <p className="sheet-p">{en.deleteCompany.stays}</p>
        <p className="fq" style={{ marginBlockStart: 8 }}>
          {en.deleteCompany.freesSlot.replace('{limit}', String(PLAN.companiesIncluded))}
        </p>
      </div>

      <div className="sheet-blk">
        <TextField
          label={en.deleteCompany.typeToConfirm.replace('{company}', label)}
          value={typed}
          onChange={setTyped}
          placeholder={label}
          autoComplete="off"
        />
      </div>

      {error !== '' ? (
        <div className="sheet-ferr" role="alert">
          {error}
        </div>
      ) : null}
    </Sheet>
  );
}
