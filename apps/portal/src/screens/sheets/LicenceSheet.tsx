import type { CompanyFacts } from '@boasis/schema';
import { useState } from 'react';
import { Button } from '../../components/Button/Button';
import { Sheet } from '../../components/Sheet/Sheet';
import { en } from '../../copy/en';
import { kindLabel, placeOf, type Bundle } from '../../lib/entries';
import { formatLong } from '../../lib/format';
import { IconPen } from '../../lib/icons';
import { CompanySheet } from './CompanySheet';
import './sheets.css';

const LEGAL_FORM_LABEL: Readonly<Record<CompanyFacts['identity']['legalForm'], string>> = {
  llc: 'LLC',
  'sole-establishment': 'Sole establishment',
  branch: 'Branch',
  fzco: 'FZCO',
  fze: 'FZE',
  'free-zone-llc': 'FZ-LLC',
  other: 'Other',
  unknown: '',
};

export interface LicenceSheetProps {
  readonly open: boolean;
  readonly bundle: Bundle;
  readonly onClose: () => void;
}

// The licence itself: what is printed on it, and the way to correct it. It is the source every
// date on the screen is computed from, so it opens as a card of its own, and editing starts
// from inside it. Only what is known: a blank field is left out rather than shown as a dash.
export function LicenceSheet({ open, bundle, onClose }: LicenceSheetProps) {
  const [editing, setEditing] = useState(false);
  const { facts, authority } = bundle;
  const identity = facts.identity;
  const yearEnd = `${identity.expiryDate.slice(0, 4)}-${identity.financialYearEnd}`;

  if (editing) {
    return (
      <CompanySheet
        open={open}
        facts={facts}
        onClose={onClose}
        onSaved={() => {
          setEditing(false);
        }}
      />
    );
  }

  const rows: readonly (readonly [string, string])[] = [
    [en.addCompany.legalName, identity.tradeName],
    [en.addCompany.legalForm, LEGAL_FORM_LABEL[identity.legalForm]],
    [en.addCompany.whereRegistered, kindLabel(authority)],
    [en.addCompany.authority, placeOf(authority)],
    [en.addCompany.licenceNumber, identity.licenceNumber],
    [en.addCompany.issuedOn, formatLong(identity.issueDate)],
    [en.addCompany.expiresOn, formatLong(identity.expiryDate)],
    [en.addCompany.incorporatedOn, formatLong(identity.incorporationDate)],
    [en.addCompany.yearEnd, formatLong(yearEnd)],
    [
      en.addCompany.vat,
      facts.tax.vat.status === 'registered'
        ? facts.tax.vat.periodMonths === 1
          ? en.addCompany.monthly
          : en.addCompany.quarterly
        : facts.tax.vat.status === 'not-registered'
          ? en.company.noVat
          : '',
    ],
  ];

  return (
    <Sheet
      open={open}
      kicker={en.company.onTheLicence}
      title={identity.tradeName}
      subtitle={[kindLabel(authority), placeOf(authority)].join(' · ')}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          icon={<IconPen size={16} />}
          onClick={() => {
            setEditing(true);
          }}
        >
          {en.company.editLicence}
        </Button>
      }
    >
      <div className="sheet-blk">
        {rows
          .filter(([, value]) => value !== '')
          .map(([key, value]) => (
            <div className="prow" key={key}>
              <div className="prow__k">{key}</div>
              <div className="prow__v">{value}</div>
            </div>
          ))}
      </div>
      {/* The two fields the whole calendar hangs on, said once where it matters. */}
      <div className="sheet-blk">
        <div className="sheet-note">
          <p>{en.company.whyTheseDates}</p>
        </div>
      </div>
    </Sheet>
  );
}
