import {
  AccountRoleInCompany,
  Emirate,
  type AuthorityIndexEntry,
  type AuthorityId,
} from '@boasis/schema';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { useOnboardingRefresh, type OnboardingWorld } from '../../data/onboarding';
import { useRepos } from '../../data/ReposProvider';
import { LICENCE_PATH, planRoom } from '../../lib/onboarding/steps';
import { PLANS } from '../../lib/plan';
import { today } from '../../lib/today';
import { Choice } from './controls';
import { Frame } from './Frame';
import { useZones } from './Onboarding';

// Step 1 (section C step 1 and D): where the company is licensed and who the person is to it.
// The plan limit is checked here; mainland shows "coming soon" with a waitlist.

type Jurisdiction = 'free-zone' | 'mainland';

export function freeZones(entries: readonly AuthorityIndexEntry[]): AuthorityIndexEntry[] {
  return entries
    .filter((entry) => entry.type.value === 'free-zone')
    .sort((a, b) => (a.name.value ?? a.id).localeCompare(b.name.value ?? b.id));
}

export function searchZones(
  entries: readonly AuthorityIndexEntry[],
  text: string,
): AuthorityIndexEntry[] {
  const wanted = text.trim().toLowerCase();
  if (wanted === '') {
    return [...entries];
  }
  return entries.filter(
    (entry) =>
      (entry.name.value ?? '').toLowerCase().includes(wanted) ||
      entry.aliases.some((alias) => alias.toLowerCase().includes(wanted)),
  );
}

export function StepWhere({ world }: { world: OnboardingWorld }) {
  const repos = useRepos();
  const refresh = useOnboardingRefresh();
  const navigate = useNavigate();
  const zones = useZones();
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction | ''>('');
  const [zone, setZone] = useState<AuthorityId>('');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<AccountRoleInCompany | ''>('');
  const [errors, setErrors] = useState<{ zone?: string; role?: string; jurisdiction?: string }>({});
  const [busy, setBusy] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const searchId = useId();

  const room = planRoom(world.account, world.links);
  if (room.kind === 'full') {
    const one = world.account.plan === 'one-company';
    return (
      <div className="pg ob ob--narrow">
        <h1 className="ob__title">{copy.where.title}</h1>
        <div className="ob-note ob-note--warn" role="status" data-testid="plan-limit">
          <div className="ob-note__text">
            {one
              ? copy.where.planFullOne(
                  PLANS['up-to-three'].companies,
                  PLANS['up-to-three'].priceAed,
                )
              : copy.where.planFull(room.covers)}
          </div>
        </div>
        {one ? (
          <div className="ob__actions">
            <button
              type="button"
              className="ob-btn ob-btn--primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void repos.accounts
                  .update(world.account.id, { plan: 'up-to-three' })
                  .then(refresh)
                  .then(() => {
                    setBusy(false);
                    setUpgraded(true);
                  });
              }}
            >
              {copy.where.upgrade}
            </button>
          </div>
        ) : null}
        {upgraded ? (
          <p role="status">{copy.where.upgraded(PLANS['up-to-three'].companies)}</p>
        ) : null}
      </div>
    );
  }

  if (jurisdiction === 'mainland') {
    return (
      <Mainland
        world={world}
        onInstead={() => {
          setJurisdiction('free-zone');
        }}
      />
    );
  }

  const all = freeZones(zones.data ?? []);
  const shown = searchZones(all, search);
  const roleOptions = AccountRoleInCompany.options.map((value) => ({
    value,
    label: copy.where.roles[value],
  }));

  const submit = () => {
    const found: typeof errors = {};
    if (jurisdiction === '') {
      found.jurisdiction = copy.where.zoneError;
    }
    if (zone === '') {
      found.zone = copy.where.zoneError;
    }
    if (role === '') {
      found.role = copy.where.roleError;
    }
    setErrors(found);
    if (zone === '' || role === '' || jurisdiction === '') {
      return;
    }
    setBusy(true);
    void repos.onboarding
      .saveStart({ accountId: world.account.id, authority: zone, role, updatedOn: today() })
      .then(refresh)
      .then(() => navigate(LICENCE_PATH));
  };

  return (
    <Frame
      step="add-company"
      title={copy.where.title}
      why={copy.where.why}
      onContinue={submit}
      busy={busy}
    >
      <Choice<Jurisdiction>
        label={copy.where.jurisdiction}
        why={copy.where.jurisdictionWhy}
        required
        value={jurisdiction}
        error={errors.jurisdiction}
        options={[
          { value: 'free-zone', label: copy.where.freeZone },
          { value: 'mainland', label: copy.where.mainland },
        ]}
        onChange={setJurisdiction}
      />
      {jurisdiction === 'free-zone' ? (
        <fieldset
          className={`ob-choice${errors.zone !== undefined ? ' ob-choice--error' : ''}`}
          aria-describedby={`${searchId}-why${errors.zone !== undefined ? ` ${searchId}-error` : ''}`}
        >
          <legend className="ob-label">
            {copy.where.zone}
            <span className="ob-req"> ({copy.common.required})</span>
          </legend>
          <label className="ob-sr" htmlFor={searchId}>
            {copy.where.zoneSearch}
          </label>
          <input
            id={searchId}
            className="ob-input"
            type="search"
            placeholder={copy.where.zoneSearch}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
            }}
          />
          <div className="ob-zones" role="radiogroup" aria-label={copy.where.zone}>
            {shown.length === 0 ? <p className="ob-why">{copy.where.zoneNone}</p> : null}
            {shown.map((entry) => (
              <label key={entry.id} className={`ob-zone${zone === entry.id ? ' ob-zone--on' : ''}`}>
                <input
                  type="radio"
                  name="zone"
                  value={entry.id}
                  aria-label={entry.name.value ?? entry.id}
                  checked={zone === entry.id}
                  onChange={() => {
                    setZone(entry.id);
                  }}
                />
                <span>{entry.name.value ?? entry.id}</span>
              </label>
            ))}
          </div>
          <p className="ob-why" id={`${searchId}-why`}>
            {copy.where.zoneWhy}
          </p>
          {errors.zone !== undefined ? (
            <p className="ob-error" id={`${searchId}-error`} role="alert">
              {errors.zone}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <Choice<AccountRoleInCompany>
        label={copy.where.role}
        why={copy.where.roleWhy}
        required
        value={role}
        error={errors.role}
        options={roleOptions}
        onChange={setRole}
      />
      {role === 'adviser' ? <p className="ob-why">{copy.where.adviser}</p> : null}
      <p className="ob-why">
        {copy.account.planOption(
          PLANS[world.account.plan].companies,
          PLANS[world.account.plan].priceAed,
        )}
      </p>
    </Frame>
  );
}

function Mainland({ world, onInstead }: { world: OnboardingWorld; onInstead: () => void }) {
  const repos = useRepos();
  const [emirate, setEmirate] = useState<Emirate | ''>('');
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<{ emirate?: string; consent?: string }>({});
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const emirateId = useId();
  const consentId = useId();
  return (
    <div className="pg ob ob--narrow" data-testid="mainland-soon">
      <h1 className="ob__title" tabIndex={-1}>
        {copy.mainland.title}
      </h1>
      <p className="ob__why">{copy.mainland.why}</p>
      {joined ? (
        <p className="ob-note ob-note--info" role="status">
          {copy.mainland.joined}
        </p>
      ) : (
        <form
          className="ob__fields"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const found: typeof errors = {};
            if (emirate === '') {
              found.emirate = copy.mainland.emirateError;
            }
            if (!consent) {
              found.consent = copy.mainland.consentError;
            }
            setErrors(found);
            if (emirate === '' || !consent) {
              return;
            }
            setBusy(true);
            void repos.onboarding
              .joinWaitlist({
                accountId: world.account.id,
                email: world.account.email,
                emirate,
                emailConsent: consent,
                createdOn: today(),
              })
              .then(() => {
                setBusy(false);
                setJoined(true);
              });
          }}
        >
          <div className={`ob-field${errors.emirate !== undefined ? ' ob-field--error' : ''}`}>
            <label className="ob-label" htmlFor={emirateId}>
              {copy.mainland.emirate}
            </label>
            <select
              id={emirateId}
              className="ob-select"
              value={emirate}
              aria-invalid={errors.emirate !== undefined || undefined}
              aria-describedby={errors.emirate !== undefined ? `${emirateId}-error` : undefined}
              onChange={(event) => {
                const value = Emirate.safeParse(event.currentTarget.value);
                setEmirate(value.success ? value.data : '');
              }}
            >
              <option value="">{copy.mainland.emirate}</option>
              {Emirate.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            {errors.emirate !== undefined ? (
              <p className="ob-error" id={`${emirateId}-error`} role="alert">
                {errors.emirate}
              </p>
            ) : null}
          </div>
          <div className="ob-field">
            <label className="ob-check" htmlFor={consentId}>
              <input
                id={consentId}
                type="checkbox"
                aria-label={copy.mainland.consent}
                checked={consent}
                aria-invalid={errors.consent !== undefined || undefined}
                aria-describedby={errors.consent !== undefined ? `${consentId}-error` : undefined}
                onChange={(event) => {
                  setConsent(event.currentTarget.checked);
                }}
              />
              <span>{copy.mainland.consent}</span>
            </label>
            {errors.consent !== undefined ? (
              <p className="ob-error" id={`${consentId}-error`} role="alert">
                {errors.consent}
              </p>
            ) : null}
          </div>
          <div className="ob__actions">
            <button type="submit" className="ob-btn ob-btn--primary" disabled={busy}>
              {copy.mainland.join}
            </button>
          </div>
        </form>
      )}
      <div className="ob__actions">
        <button type="button" className="ob-btn" onClick={onInstead}>
          {copy.mainland.instead}
        </button>
      </div>
    </div>
  );
}
