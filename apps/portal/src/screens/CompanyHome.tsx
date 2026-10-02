import { questionsToAsk } from '@boasis/rules';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { Dial, DialLegend } from '../components/Dial/Dial';
import { cx } from '../components/shared/cx';
import { en } from '../copy/en';
import { useCompanyData } from '../data/bundles';
import { alertsOf } from '../lib/alerts';
import { companyColour, companyLogo } from '../lib/brand';
import { kindLabel, monogramOf, placeOf, settledOf, upcomingOf, type Entry } from '../lib/entries';
import { Offices } from './office/Offices';
import { plural } from '../lib/format';
import { IconChevron, IconDoc } from '../lib/icons';
import { Documents } from './Documents';
import { NotFound } from './NotFound';
import { PeopleList } from './PeopleList';
import { Summary } from './home/Summary';
import { Timeline } from './home/Timeline';
import { topTitle, topUnit } from './home/TopItem';
import { topItem } from '../lib/topItem';
import { useSheets } from './sheets/useSheets';
import './home/home.css';

// One company, and everything about it (lite's CompanyView). The app navigates by object: you
// do not think "let me look at the documents", you think "let me deal with Al Reef". So a
// company is a folder, and its tabs are what there is to know about it: the dates, the office,
// the documents, the visas, the renewals. The tabs sit under the name; the main bar stays put.
export type CompanyTab = 'dates' | 'office' | 'documents' | 'people' | 'settings';

export function CompanyHome({ tab = 'dates' }: { readonly tab?: CompanyTab }) {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const data = useCompanyData(id);
  const sheets = useSheets({
    onCompanyRemoved: () => {
      void navigate('/');
    },
  });

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
  const { facts, authority } = view.bundle;
  const upcoming = upcomingOf(view.entries);
  const settled = settledOf(view.entries);
  // The hub shows the same most important item the home picks, among this company's items.
  const top = topItem(upcoming, alertsOf(view.bundle, view.entries, data.today));
  // The same count the answers sheet shows in its subtitle.
  const questionsLeft = questionsToAsk({
    facts,
    authority,
    documents: view.bundle.documents,
  }).length;
  const openEntry = (entry: Entry) => {
    sheets.open({ kind: 'deadline', entry, showCompany: false });
  };
  const tabs = [
    { id: 'dates', label: en.company.tabDates, to: `/companies/${id}` },
    { id: 'office', label: en.company.tabOffice, to: `/companies/${id}/offices` },
    { id: 'documents', label: en.company.tabDocs, to: `/companies/${id}/documents` },
    { id: 'people', label: en.company.tabVisas, to: `/companies/${id}/people` },
    { id: 'settings', label: en.company.tabSettings, to: `/companies/${id}/renewals` },
  ] as const;

  return (
    <div className="co">
      {/* Out before in: the way back to the list has to be a way back. */}
      <button
        type="button"
        className="back"
        onClick={() => {
          void navigate('/companies');
        }}
      >
        <IconChevron className="back__rev" size={15} />
        {plural(data.all.length, en.company.allCompanies.one, en.company.allCompanies.other)}
      </button>

      <div className="cohead">
        <div className="cohead__av" style={{ '--company-colour': companyColour(facts) }}>
          {companyLogo(facts) === null ? (
            monogramOf(facts.identity.tradeName)
          ) : (
            <img src={companyLogo(facts) ?? ''} alt="" />
          )}
        </div>
        <div className="cohead__who">
          <h2 className="cohead__title">{facts.identity.tradeName}</h2>
          <div className="cohead__m">{[kindLabel(authority), placeOf(authority)].join(' · ')}</div>
        </div>
        {/* Not "Licence": that reads as the PDF. This opens what is written on it. */}
        <button
          type="button"
          className="btn3"
          onClick={() => {
            sheets.open({ kind: 'licence', view });
          }}
        >
          <IconDoc size={15} />
          {en.company.onTheLicence}
        </button>
      </div>

      <nav className="cotabs" aria-label="Company">
        {tabs.map((item) => (
          <NavLink
            key={item.id}
            to={item.to}
            end
            className={cx('cotabs__tab', item.id === tab && 'cotabs__tab--on')}
            aria-current={item.id === tab ? 'page' : undefined}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {tab === 'dates' ? (
        <>
          <div className="year year--full year--tight">
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
                {top === null ? (
                  <span className="dial__unit">{en.year.nothingDue}</span>
                ) : (
                  <>
                    <span className="dial__number">{Math.abs(top.entry.days)}</span>
                    <span className="dial__unit">{topUnit(top)}</span>
                    <span className="dial__word">{topTitle(top)}</span>
                  </>
                )}
              </Dial>
              <DialLegend
                companies={[
                  { id: facts.id, name: facts.identity.tradeName, colour: companyColour(facts) },
                ]}
              />
            </div>
            <Summary companies={[{ facts, authority }]} entries={upcoming} isAll={false} compact />
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
          <p className="vhead__slots" style={{ marginBlockStart: 18 }}>
            {plural(
              view.bundle.documents.length,
              en.company.documentsCount.one,
              en.company.documentsCount.other,
            )}
          </p>
        </>
      ) : tab === 'office' ? (
        <Offices bundle={view.bundle} today={data.today} />
      ) : tab === 'documents' ? (
        <Documents />
      ) : tab === 'people' ? (
        <PeopleList />
      ) : (
        <div className="ask">
          {/* The two entries of the renewals tab: what is not yet known, and what does not
              arrive by a calendar. The first only shows while a question remains. */}
          <button
            type="button"
            className="askq"
            onClick={() => {
              sheets.open({ kind: 'answers', view });
            }}
          >
            <span className="askq__bd">
              <span className="askq__t">{en.answers.title}</span>
              <span className="askq__s">
                {questionsLeft === 0
                  ? en.answers.nothing
                  : plural(questionsLeft, en.answers.sub.one, en.answers.sub.other)}
              </span>
            </span>
            <IconChevron />
          </button>
          <button
            type="button"
            className="askq"
            onClick={() => {
              sheets.open({ kind: 'event', view });
            }}
          >
            <span className="askq__bd">
              <span className="askq__t">{en.event.title}</span>
              <span className="askq__s">{en.event.sub}</span>
            </span>
            <IconChevron />
          </button>
        </div>
      )}

      {sheets.element}
    </div>
  );
}
