import { Row } from '../../components/Row/Row';
import { cx } from '../../components/shared/cx';
import { en } from '../../copy/en';
import { daysLabel, type Entry } from '../../lib/entries';
import { formatMonth, formatShort } from '../../lib/format';
import { IconArchive } from '../../lib/icons';
import './home.css';

export interface TimelineProps {
  readonly entries: readonly Entry[];
  // In the all-companies view the initials replace the pip, so you can tell whose date it is
  // without reading.
  readonly showCompany: boolean;
  readonly settledCount: number;
  readonly onOpenEntry: (entry: Entry) => void;
  readonly onOpenArchive: () => void;
  readonly className?: string;
}

// Lite's timeline: the section title with the archive at the end of the same line, then every
// date in order, a month label where the month changes. The title is always there: it names
// what is read. The archive button appears only when there is something behind it.
export function Timeline({
  entries,
  showCompany,
  settledCount,
  onOpenEntry,
  onOpenArchive,
  className,
}: TimelineProps) {
  return (
    <div className={cx('tl', className)}>
      <div className="tl__archbar">
        <h3 className="tl__heading">{en.year.upcoming}</h3>
        {settledCount > 0 ? (
          <button type="button" className="tl__toarch" onClick={onOpenArchive}>
            <IconArchive size={15} />
            {en.year.archive}
          </button>
        ) : null}
      </div>

      {entries.map((entry, index) => {
        const label = formatMonth(entry.date);
        const previous = entries[index - 1];
        const isNewMonth = previous === undefined || formatMonth(previous.date) !== label;
        return (
          <div key={entry.id}>
            {isNewMonth ? (
              <div className="tl__month">
                <span className="tl__month-name">{label}</span>
                <span className="tl__month-rule" />
              </div>
            ) : null}
            <DeadlineRow
              entry={entry}
              showCompany={showCompany}
              onOpen={() => {
                onOpenEntry(entry);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

// One deadline in the timeline. Both the pip and the initials carry the family colour, the same
// one its mark has on the dial: without that the colours would be decoration.
export function DeadlineRow({
  entry,
  showCompany,
  onOpen,
}: {
  readonly entry: Entry;
  readonly showCompany: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <Row
      className="tl__row"
      leading={
        showCompany ? (
          <span className={cx('tl__ini', `tl__ini--${entry.family}`)}>{entry.monogram}</span>
        ) : (
          <span className={cx('tl__pip', `tl__pip--${entry.family}`)} />
        )
      }
      title={entry.title}
      subtitle={showCompany ? `${entry.companyName} · ${entry.subtitle}` : entry.subtitle}
      value={formatShort(entry.date)}
      valueNote={daysLabel(entry.days)}
      daysLeft={entry.days}
      onSelect={onOpen}
    />
  );
}
