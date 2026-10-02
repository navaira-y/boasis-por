import type { CompanyFacts } from '@boasis/schema';
import { useRef, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { en } from '../../copy/en';
import { IconPen, IconScan, IconUpload } from '../../lib/icons';
import { CompanyFields, useCompanyForm } from './CompanyForm';
import './sheets.css';

// Adding a licence: photograph it, drop the PDF in, or type it. Whichever route, the form is the
// last step and nothing is written before it. Reading a document is not switched on in the
// portal yet, so the two file routes land on the same form with lite's own note.
export interface CompanySheetProps {
  readonly open: boolean;
  // The company being edited, or null to add one.
  readonly facts: CompanyFacts | null;
  readonly onClose: () => void;
  readonly onSaved: (saved: CompanyFacts) => void;
  // Straight to the form: the way in was chosen on the page that opened the sheet.
  readonly typed?: boolean;
}

export function CompanySheet({ open, facts, onClose, onSaved, typed = false }: CompanySheetProps) {
  const state = useCompanyForm(facts);
  const { editing, ready, busy } = state;
  // 'how' asks the route; 'form' is the only step that can save.
  const [step, setStep] = useState<'how' | 'form'>(editing || typed ? 'form' : 'how');
  const [readNote, setReadNote] = useState('');
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  // A file cannot be read here yet: straight to the form, with the reason above the first field.
  function read() {
    setReadNote(en.licence.notConfigured);
    setStep('form');
  }

  const submit = () => {
    void state.submit((saved) => {
      onSaved(saved);
      onClose();
    });
  };

  if (step === 'how') {
    return (
      <Sheet
        open={open}
        kicker={en.licence.step}
        title={en.addCompany.title}
        subtitle={en.licence.how}
        onClose={onClose}
      >
        <div className="src2">
          <button type="button" className="src2__btn" onClick={() => camera.current?.click()}>
            <span className="src2__ic">
              <IconScan />
            </span>
            <span className="src2__t">{en.licence.photo}</span>
            <span className="src2__s">{en.licence.photoNote}</span>
          </button>
          <button type="button" className="src2__btn" onClick={() => picker.current?.click()}>
            <span className="src2__ic">
              <IconUpload size={21} />
            </span>
            <span className="src2__t">{en.licence.file}</span>
            <span className="src2__s">{en.licence.fileNote}</span>
          </button>
          <button
            type="button"
            className="src2__btn"
            onClick={() => {
              setStep('form');
            }}
          >
            <span className="src2__ic">
              <IconPen />
            </span>
            <span className="src2__t">{en.licence.manual}</span>
            <span className="src2__s">{en.licence.manualNote}</span>
          </button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={() => {
            read();
          }}
        />
        <input
          ref={picker}
          type="file"
          accept="application/pdf,image/*"
          hidden
          onChange={() => {
            read();
          }}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      kicker={editing ? en.addCompany.editStep : en.licence.step}
      title={editing ? en.addCompany.editTitle : en.addCompany.title}
      subtitle={en.addCompany.sub}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" onClick={submit} disabled={!ready || busy} loading={busy}>
            {busy ? en.addCompany.busy : editing ? en.addCompany.save : en.addCompany.add}
          </Button>
          {editing || typed ? null : (
            <Button
              variant="secondary"
              onClick={() => {
                setStep('how');
              }}
            >
              {en.licence.again}
            </Button>
          )}
        </>
      }
    >
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <CompanyFields state={state} readNote={readNote} />
      </form>
    </Sheet>
  );
}
