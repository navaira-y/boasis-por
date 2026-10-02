import { snapshotDates, type CompanySnapshot, type DatedItem } from '@boasis/rules';
import type { OnboardingStep } from '@boasis/schema';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { PHONE_QUERY, useMediaQuery } from '../../components';
import { onboarding as copy } from '../../copy/en';
import { federalRules } from '../../content/federal';
import { formatLong } from '../../lib/format';
import { STEP_COUNT, stepNumber } from '../../lib/onboarding/steps';
import { today } from '../../lib/today';
import { GradeChip, Sources, StatusChip } from './controls';
import './onboarding.css';

// One onboarding screen (section B.1): the step count, the title, one "why we ask" line, the
// fields, then Continue and "I'll add this later". The title takes the focus when the step
// opens, so a screen reader starts at the top of the new step. Beside it on a wide screen, and as
// a bar at the bottom on a phone, "Your dates so far" fills in as answers arrive (section B.4).

export interface FrameProps {
  readonly step: OnboardingStep;
  readonly title: string;
  readonly why?: string;
  readonly children: ReactNode;
  readonly onContinue: () => void;
  readonly onLater?: () => void;
  readonly onBack?: () => void;
  readonly busy?: boolean;
  readonly error?: string;
  readonly continueLabel?: string;
  // The answers so far, saved and live, for the side panel. Absent before a company exists.
  readonly snapshot?: CompanySnapshot | null;
}

export function Frame({
  step,
  title,
  why,
  children,
  onContinue,
  onLater,
  onBack,
  busy = false,
  error,
  continueLabel,
  snapshot,
}: FrameProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [step, title]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!busy) {
      onContinue();
    }
  };
  return (
    <div className="pg ob">
      <div className="ob__layout">
        <form className="ob__main" onSubmit={submit} noValidate aria-busy={busy || undefined}>
          <p className="ob__step">{copy.common.stepOf(stepNumber(step), STEP_COUNT)}</p>
          <h1 className="ob__title" ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {why !== undefined ? <p className="ob__why">{why}</p> : null}
          <div className="ob__fields">{children}</div>
          {error !== undefined ? (
            <p className="ob-error ob__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="ob__actions">
            <button type="submit" className="ob-btn ob-btn--primary" disabled={busy}>
              {busy ? copy.common.saving : (continueLabel ?? copy.common.continue)}
            </button>
            {onLater !== undefined ? (
              <button type="button" className="ob-btn" disabled={busy} onClick={onLater}>
                {copy.common.later}
              </button>
            ) : null}
            {onBack !== undefined ? (
              <button
                type="button"
                className="ob-btn ob-btn--quiet"
                disabled={busy}
                onClick={onBack}
              >
                {copy.common.back}
              </button>
            ) : null}
          </div>
        </form>
        {snapshot !== undefined ? <DatesPanel snapshot={snapshot ?? null} /> : null}
      </div>
    </div>
  );
}

// Section B.4: the dates computed from the answers so far, each with its source and grade.
export function DatesPanel({ snapshot }: { snapshot: CompanySnapshot | null }) {
  const phone = useMediaQuery(PHONE_QUERY);
  const [open, setOpen] = useState(false);
  const day = today();
  const dates =
    snapshot === null ? { dated: [], late: [] } : snapshotDates(snapshot, federalRules, day);
  const count = dates.dated.length + dates.late.length;
  const body = (
    <div className="ob-panel__body" id="ob-dates-body">
      {count === 0 ? <p className="ob-why">{copy.panel.empty}</p> : null}
      <ul className="ob-panel__list">
        {dates.late.map((entry) => (
          <li key={entry.id} className="ob-panel__item ob-panel__item--late">
            <span className="ob-panel__what">{copy.panel.late}</span>
            <span className="ob-grade ob-grade--late">{copy.year.late}</span>
            <GradeChip grade="confirmed" />
            <Sources basis={entry.basis} />
          </li>
        ))}
        {dates.dated.map((entry) => (
          <DatedRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </div>
  );
  if (phone) {
    return (
      <aside
        className="ob-panel ob-panel--bar"
        aria-label={copy.panel.title}
        data-testid="dates-panel"
      >
        <button
          type="button"
          className="ob-panel__toggle"
          aria-expanded={open}
          aria-controls="ob-dates-body"
          onClick={() => {
            setOpen(!open);
          }}
        >
          {copy.panel.toggle(count)}
        </button>
        {open ? body : null}
      </aside>
    );
  }
  return (
    <aside className="ob-panel" aria-label={copy.panel.title} data-testid="dates-panel">
      <h2 className="ob-panel__title">{copy.panel.title}</h2>
      {body}
    </aside>
  );
}

function DatedRow({ entry }: { entry: DatedItem }) {
  const grade = entry.basis.length === 0 ? 'own' : (entry.basis[0]?.grade ?? 'own');
  const next = entry.reminders[0];
  return (
    <li className="ob-panel__item">
      <span className="ob-panel__date">{formatLong(entry.dueOn)}</span>
      <span className="ob-panel__what">
        {copy.dated[entry.kind]}
        {entry.personName !== null ? `, ${entry.personName}` : ''}
        {entry.calculated === true ? ` (${copy.year.calculated})` : ''}
      </span>
      <StatusChip entry={entry} />
      <GradeChip grade={grade} />
      {next !== undefined && next !== entry.dueOn ? (
        <span className="ob-panel__next">{copy.panel.nextReminder(formatLong(next))}</span>
      ) : null}
      {entry.basis.length > 0 ? <Sources basis={entry.basis} /> : null}
    </li>
  );
}
