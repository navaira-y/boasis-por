import type { AuthorityFile, CompanyFacts } from '@boasis/schema';
import { cx } from '../../components/shared/cx';
import { en } from '../../copy/en';
import { companyColour, companyLogo } from '../../lib/brand';
import { kindLabel, monogramOf, placeOf, type Entry } from '../../lib/entries';
import { formatShort, plural } from '../../lib/format';
import { IconTrash } from '../../lib/icons';
import './home.css';

export interface CompanyCardProps {
  readonly facts: CompanyFacts;
  readonly authority: AuthorityFile;
  readonly entries: readonly Entry[];
  readonly onOpen: () => void;
  readonly onDelete: () => void;
}

// Lite's company card: the whole card opens the company; the action sits above it and keeps its
// own click. Easy to tell apart, easy to enter, possible to remove.
export function CompanyCard({ facts, authority, entries, onOpen, onDelete }: CompanyCardProps) {
  const next = entries[0];
  const name = facts.identity.tradeName;
  const logo = companyLogo(facts);
  return (
    <div className={cx('cocard', next !== undefined && next.days <= 30 && 'cocard--soon')}>
      <button type="button" className="cocard__open" onClick={onOpen} aria-label={name} />
      <span className="cocard__av" style={{ '--company-colour': companyColour(facts) }}>
        {logo === null ? monogramOf(name) : <img src={logo} alt="" />}
      </span>
      <span className="cocard__bd">
        <span className="cocard__t">{name}</span>
        <span className="cocard__s">{[kindLabel(authority), placeOf(authority)].join(' · ')}</span>
      </span>
      <span className="cocard__rt">
        <span className="cocard__d">{next === undefined ? 'not set' : formatShort(next.date)}</span>
        <span className="cocard__c">
          {en.company.dates.replace('{count}', String(entries.length))}
        </span>
      </span>
      <span className="cocard__acts">
        <button
          type="button"
          className="cocard__danger"
          onClick={onDelete}
          aria-label={en.deleteCompany.action}
          title={en.deleteCompany.action}
        >
          <IconTrash size={16} />
          <span className="cocard__lbl">{en.deleteCompany.action}</span>
        </button>
      </span>
    </div>
  );
}

export function slotsLine(owned: number, limit: number): string {
  const base = plural(owned, en.company.slots.one, en.company.slots.other).replace(
    '{limit}',
    String(limit),
  );
  return owned > limit ? `${base} ${en.company.slotsFull.replace('{limit}', String(limit))}` : base;
}
