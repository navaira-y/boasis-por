import { useNavigate } from 'react-router-dom';
import { en } from '../copy/en';
import { useHomeData } from '../data/bundles';
import { upcomingOf } from '../lib/entries';
import { IconPlus } from '../lib/icons';
import { PLAN } from '../lib/plan';
import { CompanyCard, slotsLine } from './home/CompanyCards';
import { useSheets } from './sheets/useSheets';
import './home/home.css';

// Lite's list of companies. Opening one leads into its folder, where everything about it lives;
// this screen only has to make them easy to tell apart, easy to enter, and possible to remove.
export function Companies() {
  const navigate = useNavigate();
  const home = useHomeData();
  const sheets = useSheets({
    onCompanySaved: (saved, wasNew) => {
      if (wasNew) {
        void navigate(`/companies/${saved.id}`);
      }
    },
  });

  if (home.error !== null) {
    return <p role="alert">{home.error.message}</p>;
  }
  if (home.pending) {
    return <p role="status">Loading</p>;
  }
  const views = home.companies;
  const kinds = new Set(views.map((view) => view.bundle.authority.identity.type.value)).size;

  return (
    <>
      <div className="vhead">
        <div>
          <h2 className="vhead__title">{en.company.title}</h2>
          <p className="vhead__sub">
            {en.company.subtitle
              .replace('{licences}', String(views.length))
              .replace('{kinds}', String(kinds))}
          </p>
          <p className="vhead__slots">{slotsLine(views.length, PLAN.companiesIncluded)}</p>
        </div>
        <button
          type="button"
          className="add"
          onClick={() => {
            sheets.open({ kind: 'company', facts: null });
          }}
        >
          <IconPlus />
          {en.empty.cta}
        </button>
      </div>

      {views.map((view) => (
        <CompanyCard
          key={view.bundle.facts.id}
          facts={view.bundle.facts}
          authority={view.bundle.authority}
          entries={upcomingOf(view.entries)}
          onOpen={() => {
            void navigate(`/companies/${view.bundle.facts.id}`);
          }}
          onDelete={() => {
            sheets.open({ kind: 'removeCompany', view });
          }}
        />
      ))}

      {sheets.element}
    </>
  );
}
