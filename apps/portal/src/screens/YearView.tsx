import { useNavigate, useParams } from 'react-router-dom';
import { Dial, DialLegend } from '../components/Dial/Dial';
import { en } from '../copy/en';
import { useCompanyData } from '../data/bundles';
import { companyColour } from '../lib/brand';
import { settledOf, upcomingOf, type Entry } from '../lib/entries';
import { plural } from '../lib/format';
import { IconChevron } from '../lib/icons';
import { NotFound } from './NotFound';
import { Summary } from './home/Summary';
import { Timeline } from './home/Timeline';
import { useSheets } from './sheets/useSheets';
import './home/home.css';

// Lite's year page for one company: the dial, the summary beside it, then everything in date
// order.
export function YearView() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useCompanyData(id);
  const sheets = useSheets();

  if (data.error !== null) {
    return <p role="alert">{data.error.message}</p>;
  }
  if (data.view === null) {
    return <p role="status">Loading</p>;
  }
  if (data.view === undefined) {
    return <NotFound />;
  }
  const view = data.view;
  const upcoming = upcomingOf(view.entries);
  const settled = settledOf(view.entries);
  const next = upcoming[0];
  const openEntry = (entry: Entry) => {
    sheets.open({ kind: 'deadline', entry, showCompany: false });
  };

  return (
    <>
      <button
        type="button"
        className="back"
        onClick={() => {
          void navigate(`/companies/${id}`);
        }}
      >
        <IconChevron className="back__rev" size={15} />
        {view.bundle.facts.identity.tradeName}
      </button>

      <div className="year year--full">
        <div className="year__dial">
          <Dial
            today={data.today}
            marks={upcoming.map((entry) => ({
              id: entry.id,
              date: entry.date,
              family: entry.family,
              label: entry.title,
              colour: companyColour(entry.company),
              daysLeft: entry.days,
            }))}
            onSelect={(markId) => {
              const entry = upcoming.find((candidate) => candidate.id === markId);
              if (entry !== undefined) {
                openEntry(entry);
              }
            }}
          >
            {next === undefined ? (
              <span className="dial__unit">{en.year.nothingDue}</span>
            ) : (
              <>
                <span className="dial__number">{Math.abs(next.days)}</span>
                <span className="dial__unit">
                  {next.days < 0
                    ? plural(-next.days, en.year.daysLate.one, en.year.daysLate.other).replace(
                        /^\d+ /,
                        '',
                      )
                    : plural(next.days, en.year.daysLeft.one, en.year.daysLeft.other).replace(
                        /^\d+ /,
                        '',
                      )}
                </span>
                <span className="dial__word">{next.title}</span>
              </>
            )}
          </Dial>
          <DialLegend
            companies={[
              {
                id: view.bundle.facts.id,
                name: view.bundle.facts.identity.tradeName,
                colour: companyColour(view.bundle.facts),
              },
            ]}
          />
        </div>
        <Summary
          companies={[{ facts: view.bundle.facts, authority: view.bundle.authority }]}
          entries={upcoming}
          isAll={false}
        />
      </div>

      <Timeline
        entries={upcoming}
        showCompany={false}
        settledCount={settled.length}
        onOpenEntry={openEntry}
        onOpenArchive={() => {
          sheets.open({ kind: 'archive', entries: settled, showCompany: false });
        }}
      />

      {sheets.element}
    </>
  );
}
