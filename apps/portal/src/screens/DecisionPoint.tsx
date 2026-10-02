import { daysUntil, decisionPoint, requirementByKey, type Resolved } from '@boasis/rules';
import type { CompanyDecision, DecisionAnswer, Document } from '@boasis/schema';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/Button/Button';
import { cx } from '../components/shared/cx';
import { compliance, screens } from '../copy/en';
import { useCompanyData, useRefresh } from '../data/bundles';
import { useRepos } from '../data/ReposProvider';
import { formatLong, plural } from '../lib/format';
import { IconChevron } from '../lib/icons';
import { NotFound } from './NotFound';
import './lite.css';
import './compliance.css';

const copy = compliance.decision;

const ANSWERS: readonly { value: DecisionAnswer; title: string; line: string }[] = [
  { value: 'renew', title: copy.renew, line: copy.renewLine },
  { value: 'cancel', title: copy.cancel, line: copy.cancelLine },
  { value: 'shrink', title: copy.shrink, line: copy.shrinkLine },
];

// One resolved term as a line: the value, then where it came from (build plan 3A). When the
// rules could not resolve it but an agreement carries it unconfirmed, the line says so, next to
// the document, and the value is not used (spec 5.1).
function Term({
  label,
  resolved,
  format,
  unconfirmed,
}: {
  label: string;
  resolved: Resolved<number>;
  format: (value: number) => string;
  unconfirmed: { title: string; value: number } | null;
}) {
  return (
    <li>
      <span className="lines__k">
        {label}
        {resolved.value === null && unconfirmed !== null ? (
          <span className="lines__s">
            {copy.unconfirmed(unconfirmed.title)}: {format(unconfirmed.value)}
          </span>
        ) : null}
      </span>
      <span className={cx('lines__v', resolved.value === null && 'lines__v--unknown')}>
        {resolved.value === null ? copy.unknown : format(resolved.value)}
        <span className={cx('src', resolved.source === 'document' && 'src--document')}>
          {copy.source[resolved.source]}
        </span>
      </span>
    </li>
  );
}

// The unconfirmed reading of one term from the newest agreement, for the line beside it.
function unconfirmedTerm(
  documents: readonly Document[],
  key: 'cancellationWindowDays' | 'cancellationFeeInsideAed' | 'cancellationFeeOutsideAed',
): { title: string; value: number } | null {
  const agreements = documents
    .filter((document) => document.type === 'authority-agreement')
    .sort((a, b) => b.uploadedOn.localeCompare(a.uploadedOn));
  for (const document of agreements) {
    const term = document.extracted?.[key] ?? null;
    if (term !== null && term.confirmedOn === null && term.value !== null) {
      return { title: document.title, value: term.value };
    }
  }
  return null;
}

const aed = (value: number) => `AED ${value.toLocaleString('en-AE')}`;

// Screen 13 (spec 14) and spec 10: one question, three answers, the cost of cancelling inside
// the window against outside it, and what happens if nothing is answered. A mainland LLC gets
// the 180 day prompt first (spec 5.6). The answer is written to CompanyFacts.decision.
export function DecisionPoint() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const repos = useRepos();
  const refresh = useRefresh();
  const data = useCompanyData(id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (data.error !== null) {
    return <p role="alert">{data.error.message}</p>;
  }
  if (data.view === null) {
    return (
      <p className="status" role="status">
        {screens.common.loading}
      </p>
    );
  }
  if (data.view === undefined) {
    return <NotFound />;
  }
  const { bundle } = data.view;
  const { facts, authority, documents } = bundle;
  const day = data.today;
  const point = decisionPoint(facts, authority, day, documents);
  const current = facts.decision ?? null;
  const forThisExpiry = current?.forExpiry === point.expiry ? current : null;
  const days = daysUntil(point.expiry, day);
  const packages = authority.premises.packageTypes?.value ?? null;
  const visaHolders = bundle.people.filter((person) => person.status.visaExpiry !== null);
  const activities = facts.identity.activities.filter((activity) => activity.removedOn === null);
  const checklist = authority.licence.renewalChecklist?.value ?? null;

  async function write(patch: Partial<CompanyDecision>) {
    setBusy(true);
    setError('');
    const decision: CompanyDecision = {
      forExpiry: point.expiry,
      answer: forThisExpiry?.answer ?? null,
      thinkingOfClosing: forThisExpiry?.thinkingOfClosing ?? null,
      ...patch,
    };
    try {
      await repos.companies.update(facts.id, { decision });
      await refresh();
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
    setBusy(false);
  }

  const answered = point.answer;
  const prompt = point.closingPrompt;

  return (
    <div className="pg decision">
      <button
        type="button"
        className="back"
        onClick={() => {
          void navigate(`/companies/${id}/compliance`);
        }}
      >
        <IconChevron className="rev" size={15} />
        {facts.identity.tradeName}
      </button>

      <div className="card">
        <div className="sh">
          <div className="k">
            {copy.kicker} · {facts.identity.tradeName}
          </div>
          <h3>{copy.title}</h3>
          <div className="due">
            <b>{copy.expires(formatLong(point.expiry))}</b>
            <span>
              {days < 0
                ? plural(-days, compliance.card.daysLate.one, compliance.card.daysLate.other)
                : plural(days, compliance.card.daysLeft.one, compliance.card.daysLeft.other)}
            </span>
          </div>
          <p className="cpage__actby">
            {/* point.since is the decision date (90 days); point.leadDays is 180 for a mainland
                LLC, whose closing prompt line carries it below. */}
            {copy.opens(formatLong(point.since))},{' '}
            {copy.lead(requirementByKey('decision-point').defaultLeadDays)}.
          </p>
        </div>

        <div className="sb">
          {prompt !== null ? (
            <div className="blk">
              <div className="k">{copy.closingTitle}</div>
              <p>{copy.closingLine}</p>
              <p className="hintline">
                {copy.closingSince(formatLong(prompt.since))}, {copy.lead(point.leadDays)}
              </p>
              {prompt.thinkingOfClosing !== null ? (
                <p>{copy.closingAnswered(prompt.thinkingOfClosing)}</p>
              ) : null}
              {prompt.open || prompt.thinkingOfClosing !== null ? (
                <div className="pair2" style={{ marginBlockStart: 10 }}>
                  <Button
                    size="sm"
                    variant={prompt.thinkingOfClosing === true ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={() => {
                      void write({ thinkingOfClosing: true });
                    }}
                  >
                    {copy.closingYes}
                  </Button>
                  <Button
                    size="sm"
                    variant={prompt.thinkingOfClosing === false ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={() => {
                      void write({ thinkingOfClosing: false });
                    }}
                  >
                    {copy.closingNo}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="blk">
            {!point.open && answered === null ? (
              <p>{copy.notOpen}</p>
            ) : (
              <>
                {answered !== null ? (
                  <p style={{ marginBlockEnd: 10 }}>
                    {copy.answered(
                      ANSWERS.find((entry) => entry.value === answered)?.title ?? answered,
                      formatLong(point.expiry),
                    )}
                  </p>
                ) : null}
                <div className="choices">
                  {ANSWERS.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      className={cx('choice', answered === entry.value && 'choice--on')}
                      aria-pressed={answered === entry.value}
                      disabled={busy}
                      onClick={() => {
                        void write({ answer: entry.value });
                      }}
                    >
                      <span className="choice__bd">
                        <span className="choice__t">{entry.title}</span>
                        <span className="choice__s">{entry.line}</span>
                      </span>
                      <span className="choice__mark" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="blk">
            <div className="k">{copy.renew}</div>
            <ul className="lines">
              <li>
                <span className="lines__k">{copy.bundle}</span>
                <span
                  className={cx(
                    'lines__v',
                    point.renewalBundle.value === null && 'lines__v--unknown',
                  )}
                >
                  {point.renewalBundle.value === null
                    ? copy.unknown
                    : point.renewalBundle.value.join(', ')}
                  <span
                    className={cx(
                      'src',
                      point.renewalBundle.source === 'document' && 'src--document',
                    )}
                  >
                    {copy.source[point.renewalBundle.source]}
                  </span>
                </span>
              </li>
              {(checklist ?? []).map((step, index) => (
                <li key={step}>
                  <span className="lines__k">
                    {String(index + 1)}. {step}
                  </span>
                </li>
              ))}
            </ul>
            <p className="hintline">
              <Link className="cpage__link" to={`/companies/${id}/trackers/renewal`}>
                {copy.openTracker}
              </Link>
            </p>
          </div>

          <div className="blk">
            <div className="k">{copy.cancel}</div>
            <ul className="lines">
              <Term
                label={copy.window}
                resolved={point.cancellation.windowDays}
                format={copy.windowDays}
                unconfirmed={unconfirmedTerm(documents, 'cancellationWindowDays')}
              />
              <Term
                label={copy.feeInside}
                resolved={point.cancellation.feeInsideAed}
                format={aed}
                unconfirmed={unconfirmedTerm(documents, 'cancellationFeeInsideAed')}
              />
              <Term
                label={copy.feeOutside}
                resolved={point.cancellation.feeOutsideAed}
                format={aed}
                unconfirmed={unconfirmedTerm(documents, 'cancellationFeeOutsideAed')}
              />
            </ul>
            <p className="hintline">
              <Link className="cpage__link" to={`/companies/${id}/trackers/cancellation`}>
                {copy.openTracker}
              </Link>
            </p>
          </div>

          <div className="blk">
            <div className="k">{copy.shrink}</div>
            <ul className="lines lines--stack">
              <li>
                <span className="lines__k">{copy.shrinkVisas}</span>
                <span className="lines__v">
                  {visaHolders.length === 0
                    ? copy.shrinkNone
                    : visaHolders.map((person) => person.identity.name).join(', ')}
                </span>
              </li>
              <li>
                <span className="lines__k">{copy.shrinkActivities}</span>
                <span className="lines__v">
                  {activities.length === 0
                    ? copy.shrinkNone
                    : activities.map((activity) => activity.name).join(', ')}
                </span>
              </li>
              <li>
                <span className="lines__k">{copy.shrinkPackages}</span>
                <span className={cx('lines__v', packages === null && 'lines__v--unknown')}>
                  {packages === null ? copy.unknown : packages.join(', ')}
                </span>
              </li>
            </ul>
            <p className="hintline">
              <Link className="cpage__link" to={`/companies/${id}/trackers/amendment`}>
                {copy.openTracker}
              </Link>
            </p>
          </div>

          <div className="blk">
            <div className="k">{copy.ignored}</div>
            <p>{copy.ignoredLine}</p>
          </div>

          {error !== '' ? (
            <div className="ferr" role="alert">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
