import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button/Button';
import { Sheet } from '../components/Sheet/Sheet';
import { compliance, screens } from '../copy/en';
import { useHomeData } from '../data/bundles';
import { settledOf, upcomingOf, type Entry } from '../lib/entries';
import { IconChevron } from '../lib/icons';
import { NotFound } from './NotFound';
import { Timeline } from './home/Timeline';
import { useSheets } from './sheets/useSheets';
import './lite.css';
import './compliance.css';
import './home/home.css';

const copy = compliance.calendar;

// The feed link is the backend's to issue (spec 5.4: a secret that carries company data, so it
// can be regenerated and revoked). Until then the button shows where it will live.
const FEED_PLACEHOLDER = 'webcal://feed.boasis.example/calendar/your-account-token.ics';

// Screen 11 (spec 14): every date across the companies, or of one company, in lite's Dates tab
// language: a month label where the month changes, one row per date with the company's
// initials in the family colour, tapping a row opens lite's deadline sheet. Subscribe shows
// the feed link.
export function Calendar() {
  const { id } = useParams();
  const navigate = useNavigate();
  const home = useHomeData();
  const sheets = useSheets();
  const [feedOpen, setFeedOpen] = useState(false);

  if (home.error !== null) {
    return <p role="alert">{home.error.message}</p>;
  }
  if (home.pending) {
    return (
      <p className="status" role="status">
        {screens.common.loading}
      </p>
    );
  }
  const views =
    id === undefined
      ? home.companies
      : home.companies.filter((view) => view.bundle.facts.id === id);
  const single = id === undefined ? undefined : views[0];
  if (id !== undefined && single === undefined) {
    return <NotFound />;
  }
  const entries = views
    .flatMap((view) => view.entries)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  const upcoming = upcomingOf(entries);
  const settled = settledOf(entries);
  const openEntry = (entry: Entry) => {
    sheets.open({ kind: 'deadline', entry, showCompany: id === undefined });
  };

  return (
    <div className="pg calendar">
      {single !== undefined ? (
        <button
          type="button"
          className="back"
          onClick={() => {
            void navigate(`/companies/${single.bundle.facts.id}`);
          }}
        >
          <IconChevron className="rev" size={15} />
          {single.bundle.facts.identity.tradeName}
        </button>
      ) : null}

      <div className="vhead">
        <div>
          <h2>{copy.title}</h2>
          <p>{id === undefined ? copy.subtitle : copy.subtitleOne}</p>
        </div>
        <div className="acts2">
          <button
            type="button"
            className="add g"
            onClick={() => {
              setFeedOpen(true);
            }}
          >
            {copy.subscribe}
          </button>
        </div>
      </div>

      {upcoming.length === 0 ? <p className="quiet">{copy.nothing}</p> : null}

      <Timeline
        entries={upcoming}
        showCompany={id === undefined}
        settledCount={settled.length}
        onOpenEntry={openEntry}
        onOpenArchive={() => {
          sheets.open({ kind: 'archive', entries: settled, showCompany: id === undefined });
        }}
      />

      <Sheet
        open={feedOpen}
        title={copy.feedTitle}
        subtitle={copy.feedLine}
        onClose={() => {
          setFeedOpen(false);
        }}
        footer={
          <Button
            variant="secondary"
            onClick={() => {
              setFeedOpen(false);
            }}
          >
            {screens.common.close}
          </Button>
        }
      >
        <div className="sheet-blk">
          <code className="feed">{FEED_PLACEHOLDER}</code>
        </div>
        <div className="sheet-blk">
          <div className="sheet-note">
            <p>{copy.feedPlaceholder}</p>
          </div>
        </div>
      </Sheet>

      {sheets.element}
    </div>
  );
}
