import type { CompanyFacts } from '@boasis/schema';
import { useRef, useState } from 'react';
import { Button } from '../../components/Button/Button';
import { TextField } from '../../components/Field/Field';
import { Sheet } from '../../components/Sheet/Sheet';
import { Swatches } from '../../components/Swatches/Swatches';
import { cx } from '../../components/shared/cx';
import { me } from '../../copy/en';
import { useCompanies, useRefresh, useRepos } from '../../data';
import { companyColour, companyColourSlot, companyLogo } from '../../lib/brand';
import { monogramOf } from '../../lib/entries';
import { readAsDataUrl } from '../../lib/files';
import { IconUpload } from '../../lib/icons';
import { MeHead } from './rows';
import '../lite.css';
import './ManagedCompanies.css';

const LOGO_MAX_BYTES = 512 * 1024;

// The mark of a company: its logo when one is kept, else its monogram in its colour.
function Mark({ facts, className }: { facts: CompanyFacts; className?: string }) {
  const logo = companyLogo(facts);
  return (
    <span className={cx('comark', className)} style={{ '--company-colour': companyColour(facts) }}>
      {logo === null ? monogramOf(facts.identity.tradeName) : <img src={logo} alt="" />}
    </span>
  );
}

// One company edited in a sheet: the name, its colour from the company palette, its logo. Nothing is written
// until Save.
function EditSheet({ facts, onClose }: { facts: CompanyFacts | null; onClose: () => void }) {
  const repos = useRepos();
  const refresh = useRefresh();
  const picker = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(facts?.identity.tradeName ?? '');
  const [slot, setSlot] = useState(facts === null ? 0 : companyColourSlot(facts));
  const [logo, setLogo] = useState<string | null>(facts === null ? null : companyLogo(facts));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pick = async (file: File | undefined) => {
    if (file === undefined) {
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError(me.companies.tooBig);
      return;
    }
    setError('');
    setLogo(await readAsDataUrl(file));
  };

  const save = async () => {
    if (facts === null || busy || name.trim() === '') {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await repos.companies.update(facts.id, {
        identity: { ...facts.identity, tradeName: name.trim() },
        brand: { colourSlot: slot, logoDataUrl: logo },
      });
      await refresh();
      setBusy(false);
      onClose();
    } catch (failure: unknown) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const preview: CompanyFacts | null =
    facts === null
      ? null
      : {
          ...facts,
          identity: { ...facts.identity, tradeName: name.trim() === '' ? 'Company' : name },
          brand: { colourSlot: slot, logoDataUrl: logo },
        };

  return (
    <Sheet
      open={facts !== null}
      title={facts === null ? '' : me.companies.editTitle(facts.identity.tradeName)}
      onClose={onClose}
      className="pg mco"
      footer={
        <Button
          variant="primary"
          onClick={() => {
            void save();
          }}
          disabled={busy || name.trim() === ''}
          loading={busy}
        >
          {me.companies.save}
        </Button>
      }
    >
      {preview === null ? null : (
        <div className="mco__form">
          <div className="mco__preview">
            <Mark facts={preview} className="comark--big" />
            <span className="mco__pname">{preview.identity.tradeName}</span>
          </div>
          <TextField label={me.companies.name} value={name} onChange={setName} required />
          <div className="field">
            <span className="field__label">{me.companies.colour}</span>
            <Swatches label={me.companies.colour} value={slot} onChange={setSlot} />
          </div>
          <div className="field">
            <span className="field__label">{me.companies.logo}</span>
            <button type="button" className="drop" onClick={() => picker.current?.click()}>
              <span className="drop__ic">
                {logo === null ? <IconUpload size={19} /> : <img src={logo} alt="" />}
              </span>
              <span className="drop__bd">
                <span className="drop__t">
                  {logo === null ? me.companies.chooseLogo : me.companies.replaceLogo}
                </span>
                <span className="drop__s">{me.companies.logoNote}</span>
              </span>
            </button>
            <input
              ref={picker}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              hidden
              onChange={(event) => {
                void pick(event.currentTarget.files?.[0]);
              }}
            />
            {logo !== null ? (
              <button
                type="button"
                className="mco__remove"
                onClick={() => {
                  setLogo(null);
                }}
              >
                {me.companies.removeLogo}
              </button>
            ) : null}
          </div>
          {error !== '' ? (
            <div className="ferr" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

// Managed companies (screen 18): the owner's companies, each with its mark, and an edit sheet
// for the name, the colour and the logo. Writes go to the companies repo.
export function ManagedCompanies() {
  const companies = useCompanies();
  const [editing, setEditing] = useState<CompanyFacts | null>(null);
  const list = companies.data ?? [];
  return (
    <div className="pg mco">
      <MeHead title={me.companies.title} sub={me.companies.sub} />
      {companies.isSuccess && list.length === 0 ? (
        <p className="quiet">{me.companies.none}</p>
      ) : null}
      {list.map((facts) => (
        <div className="frow mco__row" key={facts.id}>
          <Mark facts={facts} />
          <span className="bd">
            <span className="t">{facts.identity.tradeName}</span>
            <span className="s">{facts.identity.licenceNumber}</span>
          </span>
          <button
            type="button"
            className="btn3"
            onClick={() => {
              setEditing(facts);
            }}
          >
            {me.companies.edit}
          </button>
        </div>
      ))}
      <EditSheet
        key={editing?.id ?? 'none'}
        facts={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
    </div>
  );
}
