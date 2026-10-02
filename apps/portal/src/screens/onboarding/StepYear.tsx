import { combinedYear, isDated, PERSONAL_KINDS, type DatedItem } from '@boasis/rules';
import type { CompanyFacts, OnboardingTask } from '@boasis/schema';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { federalRules } from '../../content/federal';
import { useOnboardingRefresh, type OnboardingWorld } from '../../data/onboarding';
import { useRepos } from '../../data/ReposProvider';
import { colourSlotOf, colourVar } from '../../lib/companyColours';
import { formatLong } from '../../lib/format';
import { companyPeople, snapshotOf } from '../../lib/onboarding/snapshot';
import { isEmail } from '../../lib/onboarding/people';
import {
  ADD_COMPANY_PATH,
  planRoom,
  STEP_COUNT,
  stepNumber,
  stepPath,
} from '../../lib/onboarding/steps';
import { PLANS } from '../../lib/plan';
import { today } from '../../lib/today';
import { GradeChip, Sources, StatusChip } from './controls';
import type { StepProps } from './Onboarding';
import './onboarding.css';

// Step 8 (section C step 8 and D): the payoff. The next three things due, the whole year across
// every company on the account (sourced dates first, each with its grade), what we still need and
// who can answer it, the signed-in person's own papers once, the email reminder settings, and the
// ways on.

// Who does an item: the agent when one handles the zone paperwork, else the person. Tax items
// and a person's papers are the person's own.
export function doerOf(
  item: Pick<DatedItem, 'kind' | 'companyId'>,
  companies: readonly CompanyFacts[],
): 'you' | 'agent' {
  if (PERSONAL_KINDS.includes(item.kind)) {
    return 'you';
  }
  const zoneItems: readonly DatedItem['kind'][] = [
    'licence-renewal',
    'lease-end',
    'establishment-card',
  ];
  if (!zoneItems.includes(item.kind)) {
    return 'you';
  }
  const handler = companies.find((company) => company.id === item.companyId)?.profile?.handler;
  return handler?.state === 'known' && handler.value.kind === 'agent' ? 'agent' : 'you';
}

export function taskTitle(task: OnboardingTask): string {
  const special = (copy.year.taskTitles as Readonly<Record<string, string>>)[task.item];
  return special ?? copy.year.complete(copy.year.items[task.item]);
}

function YearRow({ entry, company }: { entry: DatedItem; company: CompanyFacts | undefined }) {
  const grade = entry.basis.length === 0 ? 'own' : (entry.basis[0]?.grade ?? 'own');
  return (
    <li className="ob-year__item">
      <span
        className="ob-year__dot"
        style={{ background: company === undefined ? undefined : colourVar(colourSlotOf(company)) }}
        aria-hidden="true"
      />
      <span className="ob-year__date">{formatLong(entry.dueOn)}</span>
      <span className="ob-year__what">
        {copy.dated[entry.kind]}
        {entry.personName !== null ? `, ${entry.personName}` : ''}
        {entry.calculated === true ? ` (${copy.year.calculated})` : ''}
        <span className="ob-year__company">{company?.identity.tradeName ?? ''}</span>
      </span>
      <StatusChip entry={entry} />
      <GradeChip grade={grade} />
      {entry.basis.length > 0 ? <Sources basis={entry.basis} /> : null}
    </li>
  );
}

export function YearView({ world }: { world: OnboardingWorld }) {
  const day = today();
  const snapshots = world.companies.map((facts) =>
    snapshotOf(facts, companyPeople(facts.id, world.people, world.roles)),
  );
  const year = combinedYear(snapshots, federalRules, day);
  const holder = world.people.find(
    (person) =>
      person.email !== null && person.email.toLowerCase() === world.account.email.toLowerCase(),
  );
  const own = year.personal.filter((entry) => entry.personId === holder?.id);
  const open = world.tasks.filter((task) => task.status === 'open');
  const companyOf = (id: string) => world.companies.find((company) => company.id === id);
  const personOf = (id: string | null) =>
    id === null ? undefined : world.people.find((person) => person.id === id);

  return (
    <>
      <section className="ob-block-section" aria-labelledby="ob-next" data-testid="year-next">
        <h2 className="ob-subtitle" id="ob-next">
          {copy.year.next}
        </h2>
        {year.next.length === 0 ? <p className="ob-why">{copy.year.nextNone}</p> : null}
        <ol className="ob-next">
          {year.next.map((entry) => {
            const company = companyOf(entry.companyId);
            const dated = isDated(entry) ? entry : null;
            return (
              <li key={entry.id} className="ob-next__item">
                <span className="ob-next__date">
                  {dated === null ? (
                    <span className="ob-grade ob-grade--late">{copy.year.late}</span>
                  ) : (
                    <>
                      {formatLong(dated.dueOn)} <StatusChip entry={dated} />
                    </>
                  )}
                </span>
                <span className="ob-next__what">
                  {dated === null ? copy.panel.late : copy.dated[dated.kind]}
                  {dated?.personName != null ? `, ${dated.personName}` : ''}
                  {dated?.calculated === true ? ` (${copy.year.calculated})` : ''}
                </span>
                <span className="ob-next__company">
                  <span
                    className="ob-year__dot"
                    style={{
                      background:
                        company === undefined ? undefined : colourVar(colourSlotOf(company)),
                    }}
                    aria-hidden="true"
                  />
                  {company?.identity.tradeName ?? ''}
                </span>
                <span className="ob-next__who">
                  {copy.year.doer[doerOf(entry, world.companies)]}: {copy.todo[entry.kind]}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="ob-block-section" aria-labelledby="ob-all" data-testid="year-all">
        <h2 className="ob-subtitle" id="ob-all">
          {copy.year.all}
        </h2>
        <ul className="ob-year">
          {year.late.map((entry) => (
            <li key={entry.id} className="ob-year__item ob-year__item--late">
              <span className="ob-year__date">{copy.year.late}</span>
              <span className="ob-year__what">
                {copy.panel.late}
                <span className="ob-year__company">
                  {companyOf(entry.companyId)?.identity.tradeName ?? ''}
                </span>
              </span>
              <GradeChip grade="confirmed" />
              <Sources basis={entry.basis} />
            </li>
          ))}
          {year.all.map((entry) => (
            <YearRow key={entry.id} entry={entry} company={companyOf(entry.companyId)} />
          ))}
        </ul>
      </section>

      <section className="ob-block-section" aria-labelledby="ob-need" data-testid="year-need">
        <h2 className="ob-subtitle" id="ob-need">
          {copy.year.stillNeed}
        </h2>
        {open.length === 0 ? <p className="ob-why">{copy.year.stillNeedNone}</p> : null}
        <ul className="ob-need">
          {open.map((task) => (
            <li key={task.id} className="ob-need__item">
              <span className="ob-need__what">
                {taskTitle(task)}
                {personOf(task.personId) !== undefined
                  ? `, ${personOf(task.personId)?.name ?? ''}`
                  : ''}
              </span>
              <span className="ob-need__company">
                {companyOf(task.companyId)?.identity.tradeName ?? ''}
              </span>
              <span className="ob-why">
                {copy.year.reasons[task.reason]}{' '}
                {copy.year.whoCanAnswer(task.whoCanAnswer.map((who) => copy.who[who]).join(', '))}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ob-block-section" aria-labelledby="ob-own" data-testid="year-own">
        <h2 className="ob-subtitle" id="ob-own">
          {copy.year.ownDocuments}
        </h2>
        {own.length === 0 ? <p className="ob-why">{copy.year.ownNone}</p> : null}
        <ul className="ob-year">
          {own.map((entry) => (
            <YearRow key={entry.id} entry={entry} company={companyOf(entry.companyId)} />
          ))}
        </ul>
      </section>
    </>
  );
}

function Reminders({ world }: { world: OnboardingWorld }) {
  const repos = useRepos();
  const refresh = useOnboardingRefresh();
  const stored = useQuery({
    queryKey: ['onboarding', 'reminder-emails', world.companies.map((company) => company.id)],
    queryFn: () =>
      Promise.all(world.companies.map((company) => repos.onboarding.reminderEmail(company.id))),
  });
  const [on, setOn] = useState(world.account.emailRemindersOn);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current && stored.data !== undefined) {
      loaded.current = true;
      setEmails(
        Object.fromEntries(
          stored.data.flatMap((entry) =>
            entry === null ? [] : [[entry.companyId, entry.secondEmail ?? '']],
          ),
        ),
      );
    }
  }, [stored.data]);
  return (
    <section
      className="ob-block-section"
      aria-labelledby="ob-reminders"
      data-testid="year-reminders"
    >
      <h2 className="ob-subtitle" id="ob-reminders">
        {copy.year.reminders}
      </h2>
      <label className="ob-check">
        <input
          type="checkbox"
          aria-label={copy.year.remindersOn(world.account.email)}
          checked={on}
          aria-describedby="ob-reminders-why"
          onChange={(event) => {
            setOn(event.currentTarget.checked);
            setSaved(false);
          }}
        />
        <span>{copy.year.remindersOn(world.account.email)}</span>
      </label>
      <p className="ob-why" id="ob-reminders-why">
        {copy.year.remindersWhy}
      </p>
      {world.companies.map((company) => {
        const id = `ob-second-${company.id}`;
        const error = errors[company.id];
        return (
          <div
            key={company.id}
            className={`ob-field${error !== undefined ? ' ob-field--error' : ''}`}
          >
            <label className="ob-label" htmlFor={id}>
              {copy.year.secondEmail(company.identity.tradeName)}
            </label>
            <input
              id={id}
              className="ob-input"
              type="email"
              inputMode="email"
              value={emails[company.id] ?? ''}
              aria-invalid={error !== undefined || undefined}
              aria-describedby={error !== undefined ? `${id}-why ${id}-error` : `${id}-why`}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setEmails((current) => ({ ...current, [company.id]: value }));
                setSaved(false);
              }}
            />
            <p className="ob-why" id={`${id}-why`}>
              {copy.year.secondEmailWhy}
            </p>
            {error !== undefined ? (
              <p className="ob-error" id={`${id}-error`} role="alert">
                {error}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="ob__actions">
        <button
          type="button"
          className="ob-btn"
          onClick={() => {
            const found: Record<string, string> = {};
            for (const company of world.companies) {
              const value = (emails[company.id] ?? '').trim();
              if (value !== '' && !isEmail(value)) {
                found[company.id] = copy.people.emailError;
              }
            }
            setErrors(found);
            if (Object.keys(found).length > 0) {
              return;
            }
            void (async () => {
              await repos.accounts.update(world.account.id, { emailRemindersOn: on });
              for (const company of world.companies) {
                const value = (emails[company.id] ?? '').trim();
                await repos.onboarding.saveReminderEmail({
                  companyId: company.id,
                  secondEmail: value === '' ? null : value,
                });
              }
              await refresh();
              setSaved(true);
            })();
          }}
        >
          {copy.year.saveReminders}
        </button>
        {saved ? <span role="status">{copy.year.saved}</span> : null}
      </div>
    </section>
  );
}

export function StepYear({ world, facts }: StepProps) {
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const room = planRoom(world.account, world.links);
  const sponsorNotOnBoasis = world.people.some(
    (person) => person.residenceVisa.sponsor.kind === 'own-company-not-on-boasis',
  );
  return (
    <div className="pg ob ob--wide">
      <p className="ob__step">{copy.common.stepOf(stepNumber('your-year'), STEP_COUNT)}</p>
      <h1 className="ob__title" ref={heading} tabIndex={-1}>
        {copy.year.title}
      </h1>
      <p className="ob__why">{copy.year.why}</p>
      <YearView world={world} />
      <Reminders world={world} />
      <section className="ob-block-section" aria-label={copy.year.dashboard}>
        {room.kind === 'full' && world.account.plan === 'one-company' ? (
          <p className="ob-note ob-note--info">
            {copy.where.planFullOne(PLANS['up-to-three'].companies, PLANS['up-to-three'].priceAed)}
          </p>
        ) : null}
        <div className="ob__actions">
          {room.kind === 'room' || world.account.plan === 'one-company' ? (
            <button
              type="button"
              className="ob-btn"
              onClick={() => void navigate(ADD_COMPANY_PATH)}
            >
              {sponsorNotOnBoasis ? copy.people.addThatNext : copy.year.addCompany}
            </button>
          ) : null}
          <button
            type="button"
            className="ob-btn"
            onClick={() => void navigate(stepPath(facts.id, 'employees'))}
          >
            {copy.year.addEmployees}
          </button>
          <button
            type="button"
            className="ob-btn ob-btn--primary"
            onClick={() => void navigate('/')}
          >
            {copy.year.dashboard}
          </button>
        </div>
      </section>
    </div>
  );
}
