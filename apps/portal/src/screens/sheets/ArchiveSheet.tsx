import { Sheet } from '../../components/Sheet/Sheet';
import { en } from '../../copy/en';
import type { Entry } from '../../lib/entries';
import { formatLong, plural } from '../../lib/format';
import { IconCheck } from '../../lib/icons';
import './sheets.css';

export interface ArchiveSheetProps {
  readonly open: boolean;
  readonly entries: readonly Entry[];
  readonly showCompany: boolean;
  readonly onOpenEntry: (entry: Entry) => void;
  readonly onClose: () => void;
}

// What is behind you, out of the way of what is in front of you. Rows open, because unticking
// a date starts by finding it, and this is the only place it can still be found.
export function ArchiveSheet({
  open,
  entries,
  showCompany,
  onOpenEntry,
  onClose,
}: ArchiveSheetProps) {
  return (
    <Sheet
      open={open}
      kicker={en.year.archive}
      title={plural(entries.length, en.year.settledCount.one, en.year.settledCount.other)}
      onClose={onClose}
    >
      {entries.map((entry) => {
        const doneOn = entry.card.steps.find((step) => step.done)?.doneOn ?? entry.date;
        return (
          <button
            key={entry.id}
            type="button"
            className="arch__row"
            onClick={() => {
              onOpenEntry(entry);
            }}
          >
            <span className="arch__ic">
              <IconCheck size={15} />
            </span>
            <span className="arch__bd">
              <span className="arch__t">{entry.title}</span>
              {showCompany ? <span className="arch__c">{entry.companyName}</span> : null}
            </span>
            <span className="arch__s">
              {en.obligation.doneOn.replace('{date}', formatLong(doneOn))}
            </span>
          </button>
        );
      })}
    </Sheet>
  );
}
