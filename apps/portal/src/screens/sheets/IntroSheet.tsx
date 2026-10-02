import type { CompanyFacts } from '@boasis/schema';
import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Picker } from '../../components/Picker/Picker';
import { Sheet } from '../../components/Sheet/Sheet';
import { en } from '../../copy/en';
import './sheets.css';

export interface IntroSheetProps {
  readonly open: boolean;
  // The service asked for, named as its category reads on screen.
  readonly service: string;
  readonly companies: readonly CompanyFacts[];
  readonly onDone: (companyId: string | null, note: string) => void;
  readonly onClose: () => void;
}

// Asking for an introduction: the company concerned, chosen and not guessed, and what there is
// to do, in the person's words. Nothing goes to the service: the request reaches Boasis, and
// Boasis makes the link. Shown once services are switched on (flags.services).
export function IntroSheet({ open, service, companies, onDone, onClose }: IntroSheetProps) {
  const [companyId, setCompanyId] = useState<string | null>(companies[0]?.id ?? null);
  const [note, setNote] = useState('');

  return (
    <Sheet
      open={open}
      kicker={en.partners.title}
      title={service}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          onClick={() => {
            onDone(companyId, note.trim());
          }}
        >
          {en.partners.send}
        </Button>
      }
    >
      <div className="sheet-blk">
        <p className="sheet-quiet">{en.partners.introBody}</p>
      </div>
      {companies.length > 0 ? (
        <div className="sheet-blk">
          <div className="sheet-k">{en.partners.whichCompany}</div>
          <Picker
            label={en.partners.whichCompany}
            value={companyId}
            options={companies.map((company) => ({
              value: company.id,
              label: company.identity.tradeName,
            }))}
            onChange={setCompanyId}
          />
        </div>
      ) : null}
      <div className="sheet-blk">
        <div className="sheet-k">{en.partners.whatYouNeed}</div>
        <textarea
          className="notebox"
          rows={5}
          value={note}
          maxLength={1200}
          onChange={(event) => {
            setNote(event.currentTarget.value);
          }}
          placeholder={en.partners.notePlaceholder}
          aria-label={en.partners.whatYouNeed}
        />
      </div>
    </Sheet>
  );
}
