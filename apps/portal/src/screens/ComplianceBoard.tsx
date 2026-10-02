import type { Answer, AnswerValue, Card, QuestionId, VatStatus } from '@boasis/schema';
import type { Question } from '@boasis/rules';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../components/Button/Button';
import { ComplianceCard } from '../components/ComplianceCard/ComplianceCard';
import { TextField } from '../components/Field/Field';
import { Picker } from '../components/Picker/Picker';
import { cx } from '../components/shared/cx';
import { severityOf } from '../components/StatePill/state';
import { compliance, screens } from '../copy/en';
import { useHomeData, useRefresh, type CompanyView } from '../data/bundles';
import { useRepos } from '../data/ReposProvider';
import {
  cardLine,
  cardTitle,
  requirementOf,
  isBlocked,
  isStateFilter,
  matchesFilter,
  questionFor,
  STATE_FILTERS,
  unknownReason,
  type StateFilter,
} from '../lib/cards';
import { companyColour } from '../lib/brand';
import type { Bundle } from '../lib/entries';
import { IconChevron } from '../lib/icons';
import { today } from '../lib/today';
import { NotFound } from './NotFound';
import './lite.css';
import './compliance.css';

const copy = compliance.board;

// How each question is answered: yes or no, a number, or a list of words (the same shapes as
// lite's "complete your calendar" sheet).
const SHAPE: Readonly<Record<QuestionId, 'boolean' | 'number' | 'list'>> = {
  auditRequiredForRenewal: 'boolean',
  cancellationWindowDays: 'number',
  cancellationFeeInsideAed: 'number',
  cancellationFeeOutsideAed: 'number',
  renewalBundle: 'list',
  wpsApplies: 'boolean',
  ejariRequired: 'boolean',
  generalAssemblyRequired: 'boolean',
  leaseMinimumRemainingDays: 'number',
};

// Most severe first, then the nearest date, then the id, so the board reads top down.
export function compareCards(a: Card, b: Card): number {
  const bySeverity = severityOf(a.state) - severityOf(b.state);
  if (bySeverity !== 0) {
    return bySeverity;
  }
  const ad = a.dueOn ?? '9999-99-99';
  const bd = b.dueOn ?? '9999-99-99';
  if (ad !== bd) {
    return ad < bd ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// The question an "unknown" card is waiting for, answered on the spot: the answer is written
// to CompanyFacts.answers (spec 18.1 "unknown asks for it") and the board recomputes.
function AskQuestion({ question, bundle }: { question: Question; bundle: Bundle }) {
  const repos = useRepos();
  const refresh = useRefresh();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const shape = SHAPE[question.id];

  async function write(value: AnswerValue) {
    setBusy(true);
    setError('');
    const answer: Answer = {
      questionId: question.id,
      answer: value,
      answeredOn: today(),
      source: 'owner-answer',
    };
    try {
      await repos.companies.update(bundle.facts.id, {
        answers: [...(bundle.facts.answers ?? []), answer],
      });
      await refresh();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    setBusy(false);
  }

  const submit = () => {
    if (shape === 'number') {
      const number = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(number)) {
        return;
      }
      void write(number);
    } else if (raw.trim() !== '') {
      void write(raw.trim());
    }
  };

  return (
    <div className="cask">
      <p className="cask__q">{question.text}</p>
      <div className="cask__row">
        {shape === 'boolean' ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void write(true);
              }}
            >
              {copy.yes}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                void write(false);
              }}
            >
              {copy.no}
            </Button>
          </>
        ) : (
          <>
            <TextField
              label={question.text}
              type={shape === 'number' ? 'number' : 'text'}
              value={raw}
              onChange={setRaw}
              placeholder={shape === 'number' ? '0' : 'licence, flexi-desk'}
            />
            <Button size="sm" variant="primary" disabled={busy} onClick={submit}>
              {busy ? copy.saving : copy.answer}
            </Button>
          </>
        )}
      </div>
      {error !== '' ? (
        <p className="cask__why" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// The VAT status is a company fact, not an owner answer: the card asks for it directly.
function AskVat({ bundle }: { bundle: Bundle }) {
  const repos = useRepos();
  const refresh = useRefresh();
  const [busy, setBusy] = useState(false);
  async function write(status: VatStatus) {
    setBusy(true);
    await repos.companies.update(bundle.facts.id, {
      tax: { ...bundle.facts.tax, vat: { ...bundle.facts.tax.vat, status } },
    });
    await refresh();
    setBusy(false);
  }
  return (
    <div className="cask">
      <p className="cask__q">{copy.vatQuestion}</p>
      <div className="cask__row">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            void write('registered');
          }}
        >
          {copy.registered}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            void write('not-registered');
          }}
        >
          {copy.notRegistered}
        </Button>
      </div>
    </div>
  );
}

function CardCell({
  card,
  bundle,
  day,
  onOpen,
}: {
  card: Card;
  bundle: Bundle;
  day: string;
  onOpen: () => void;
}) {
  const blocked = isBlocked(card, bundle, day);
  const question = questionFor(card, bundle);
  const requirement = requirementOf(card);
  return (
    <div className={cx('ccell', blocked && 'ccell--blocked')} data-state={card.state}>
      <ComplianceCard
        title={cardTitle(card, bundle)}
        line={cardLine(card, day)}
        state={card.state}
        onSelect={onOpen}
      />
      {blocked ? <span className="cblocked">{copy.blocked}</span> : null}
      {question !== null ? (
        <AskQuestion question={question} bundle={bundle} />
      ) : card.state === 'unknown' && requirement?.key === 'vat-registration' ? (
        <AskVat bundle={bundle} />
      ) : card.state === 'unknown' ? (
        <div className="cask">
          <p className="cask__why">{unknownReason(card, bundle)}</p>
        </div>
      ) : null}
    </div>
  );
}

// Screen 9 (spec 14): the board of spec 7.2, one card per computed requirement, grouped by company
// across the account or for one company, with a company filter and a state filter in the
// address (?state=urgent shows overdue and blocked). Every card is computed live by
// packages/rules from the company file and its authority file.
export function ComplianceBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const home = useHomeData();
  const day = home.today;

  // The home's urgent header links here with ?filter=urgent; the board also reads ?state=.
  const stateParam = params.get('state') ?? params.get('filter');
  const filter: StateFilter = isStateFilter(stateParam) ? stateParam : 'all';
  const companyParam = id ?? params.get('company');
  const companyFilter = companyParam === null || companyParam === '' ? null : companyParam;

  const setFilter = (next: StateFilter, company: string | null) => {
    const search = new URLSearchParams();
    if (next !== 'all') {
      search.set('state', next);
    }
    if (id === undefined && company !== null) {
      search.set('company', company);
    }
    setParams(search, { replace: true });
  };

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
  const companies = home.companies;
  const shown =
    companyFilter === null
      ? companies
      : companies.filter((view) => view.bundle.facts.id === companyFilter);
  if (id !== undefined && shown.length === 0) {
    return <NotFound />;
  }

  const counts = new Map<StateFilter, number>();
  for (const view of shown) {
    for (const card of view.bundle.cards) {
      for (const candidate of STATE_FILTERS) {
        if (matchesFilter(card, candidate, view.bundle, day)) {
          counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
        }
      }
    }
  }

  const groups = shown
    .map((view: CompanyView) => ({
      view,
      cards: view.bundle.cards
        .filter((card) => matchesFilter(card, filter, view.bundle, day))
        .sort(compareCards),
    }))
    .filter((group) => group.cards.length > 0);

  const single = id === undefined ? undefined : shown[0];

  return (
    <div className="pg comp">
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
          <p>{copy.subtitle}</p>
        </div>
        {id === undefined ? (
          <div className="acts2">
            <Picker<string>
              label={copy.company}
              value={companyFilter ?? 'all'}
              options={[
                { value: 'all', label: copy.allCompanies },
                ...companies.map((view) => ({
                  value: view.bundle.facts.id,
                  label: view.bundle.facts.identity.tradeName,
                })),
              ]}
              onChange={(value) => {
                setFilter(filter, value === 'all' ? null : value);
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="cfilters" role="tablist" aria-label={copy.state}>
        {STATE_FILTERS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={candidate === filter}
            className={cx('cfilter', candidate === filter && 'cfilter--on')}
            onClick={() => {
              setFilter(candidate, companyFilter);
            }}
          >
            {copy.filters[candidate]}
            <span className="cfilter__n">{String(counts.get(candidate) ?? 0)}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? <p className="quiet">{copy.empty}</p> : null}

      {groups.map(({ view, cards }) => {
        const { facts } = view.bundle;
        return (
          <section className="cgroup" key={facts.id} aria-label={facts.identity.tradeName}>
            <div className="cgroup__head">
              <span
                className="cgroup__dot"
                style={{ '--company-colour': companyColour(facts) }}
                aria-hidden="true"
              />
              <h3 className="cgroup__name">{facts.identity.tradeName}</h3>
              <span className="cgroup__count">{copy.count(cards.length)}</span>
              {id === undefined ? (
                <Link className="cgroup__link" to={`/companies/${facts.id}/compliance`}>
                  {copy.open}
                  <IconChevron size={14} />
                </Link>
              ) : null}
            </div>
            <div className="cgrid">
              {cards.map((card) => (
                <CardCell
                  key={card.id}
                  card={card}
                  bundle={view.bundle}
                  day={day}
                  onOpen={() => {
                    void navigate(
                      `/companies/${facts.id}/compliance/${encodeURIComponent(card.id)}`,
                    );
                  }}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
