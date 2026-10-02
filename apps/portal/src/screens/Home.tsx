import { useNavigate } from 'react-router-dom';
import { Dial, DialLegend } from '../components/Dial/Dial';
import { Hero } from '../components/Hero/Hero';
import { en } from '../copy/en';
import { useHomeData } from '../data/bundles';
import { alertsOf } from '../lib/alerts';
import { companyColour } from '../lib/brand';
import { upcomingOf, type Entry } from '../lib/entries';
import { IconPlus } from '../lib/icons';
import { topItem } from '../lib/topItem';
import { Panel } from './home/Panel';
import { TopItem, topTitle, topUnit } from './home/TopItem';
import { useSheets } from './sheets/useSheets';
import './home/home.css';

// Lite's home: one dial, every company, is anything on fire. The stage holds the dial with its
// legend and, beside it (under it on a phone), the one item that matters most; below the stage,
// the three groups of what needs doing.
export function Home() {
  const navigate = useNavigate();
  const home = useHomeData();
  const sheets = useSheets();

  if (home.error !== null) {
    return <p role="alert">{home.error.message}</p>;
  }
  if (home.pending) {
    return <p role="status">Loading</p>;
  }

  const views = home.companies;
  const entries: Entry[] = views.flatMap((view) => view.entries);
  const upcoming = upcomingOf(entries).sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const alerts = views.flatMap((view) => alertsOf(view.bundle, view.entries, home.today));
  // One most important item, for the hub and the block beside the dial alike.
  const top = topItem(upcoming, alerts);
  const openEntry = (entry: Entry) => {
    sheets.open({ kind: 'deadline', entry, showCompany: true });
  };
  const openTop = () => {
    if (top !== null) {
      void navigate(
        `/companies/${top.entry.company.id}/compliance/${encodeURIComponent(top.entry.card.id)}`,
      );
    }
  };

  if (views.length === 0) {
    return (
      <>
        <div className="firstrun">
          <h2 className="firstrun__title">{en.empty.title}</h2>
          <p className="firstrun__body">{en.empty.body}</p>
          <button
            type="button"
            className="add"
            onClick={() => {
              void navigate('/add-company');
            }}
          >
            <IconPlus />
            {en.empty.cta}
          </button>
        </div>
        {sheets.element}
      </>
    );
  }

  return (
    <>
      <Hero bleed>
        <div className="year year--full year--stage">
          <div className="year__dial">
            <Dial
              today={home.today}
              marks={upcoming.map((entry) => ({
                id: entry.id,
                date: entry.date,
                family: entry.family,
                label: entry.title,
                colour: companyColour(entry.company),
                daysLeft: entry.days,
              }))}
              onSelect={(id) => {
                const entry = upcoming.find((candidate) => candidate.id === id);
                if (entry !== undefined) {
                  openEntry(entry);
                }
              }}
            >
              {top === null ? (
                <span className="dial__unit">{en.year.nothingDue}</span>
              ) : (
                <>
                  {/* Past the date, the delay is counted the right way up: "-9 days left" is
                      not a sentence. */}
                  <span className="dial__number">{Math.abs(top.entry.days)}</span>
                  <span className="dial__unit">{topUnit(top)}</span>
                  <span className="dial__word">{topTitle(top)}</span>
                </>
              )}
            </Dial>
            <DialLegend
              className="year__legend"
              companies={views.map((view) => ({
                id: view.bundle.facts.id,
                name: view.bundle.facts.identity.tradeName,
                colour: companyColour(view.bundle.facts),
              }))}
            />
          </div>
          {/* The CEO's stage: beside the dial, one thing only. */}
          {top === null ? null : (
            <div className="year__side">
              <TopItem top={top} onOpen={openTop} />
            </div>
          )}
        </div>
      </Hero>

      {/* Lite's place for the urgent card and the upcoming dates: below the stage, on the page. */}
      <Panel
        today={home.today}
        alerts={alerts}
        entries={upcoming}
        companies={views.map((view) => view.bundle.facts)}
        onOpenEntry={openEntry}
        onOpenCompany={(id) => {
          void navigate(`/companies/${id}`);
        }}
      />

      {sheets.element}
    </>
  );
}
