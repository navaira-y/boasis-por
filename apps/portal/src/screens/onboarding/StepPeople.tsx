import {
  RoleKind,
  type AccountPerson,
  type Document,
  type Role,
  type VisaSponsor,
} from '@boasis/schema';
import { useState } from 'react';
import { onboarding as copy } from '../../copy/en';
import { federalRules } from '../../content/federal';
import { useOnboardingRefresh } from '../../data/onboarding';
import { useRepos } from '../../data/ReposProvider';
import type { PickedFile } from '../../lib/files';
import { fieldKeeping } from '../../lib/onboarding/fields';
import { peopleItems } from '../../lib/onboarding/needs';
import { isEmail, ownershipTooHigh, parsePercent, pickList } from '../../lib/onboarding/people';
import { companyPeople, snapshotOf, snapshotPerson } from '../../lib/onboarding/snapshot';
import { previousStep, stepPath } from '../../lib/onboarding/steps';
import { today } from '../../lib/today';
import { Choice, DateEntry, dateError, TextEntry, UploadEntry, type DateParts } from './controls';
import { dateEntry, fileUploads, partsOfField } from './form';
import { Frame } from './Frame';
import { useFinishStep, type StepProps } from './Onboarding';
import { useNavigate } from 'react-router-dom';

// Step 3 (section C step 3 and D): owners and managers. Passport, visa and Emirates ID belong to
// the person and are kept once across companies; role and ownership belong to the person in this
// company. A person picked from another company keeps their papers; role and sponsor are asked
// again. Only "This company" as sponsor takes a place in this company's quota.

type SponsorChoice = 'this-company' | 'my-company' | 'family' | 'other-employer' | 'not-resident';
const NOT_ON_BOASIS = 'not-on-boasis';

interface Draft {
  readonly personId: string | null;
  readonly reused: boolean;
  readonly name: string;
  readonly email: string;
  readonly role: RoleKind | '';
  readonly percent: string;
  readonly passport: DateParts;
  readonly passportOk: boolean;
  readonly sponsor: SponsorChoice | '';
  readonly sponsorCompany: string;
  readonly visa: DateParts;
  readonly visaOk: boolean;
  readonly emiratesId: DateParts;
  readonly emiratesIdOk: boolean;
  readonly files: readonly { file: PickedFile; type: Document['type']; title: string }[];
}

interface DraftErrors {
  name?: string;
  email?: string;
  role?: string;
  percent?: string;
  passport?: string;
  sponsor?: string;
  visa?: string;
  emiratesId?: string;
}

function sponsorChoiceOf(
  sponsor: VisaSponsor,
  companyId: string,
): { sponsor: SponsorChoice; company: string } {
  switch (sponsor.kind) {
    case 'account-company':
      return sponsor.companyId === companyId
        ? { sponsor: 'this-company', company: '' }
        : { sponsor: 'my-company', company: sponsor.companyId };
    case 'own-company-not-on-boasis':
      return { sponsor: 'my-company', company: NOT_ON_BOASIS };
    case 'family':
    case 'other-employer':
    case 'not-resident':
      return { sponsor: sponsor.kind, company: '' };
  }
}

// A form opened and never filled in: nothing to save.
function isBlank(draft: Draft): boolean {
  return (
    draft.personId === null &&
    draft.name.trim() === '' &&
    draft.email.trim() === '' &&
    draft.role === '' &&
    draft.sponsor === ''
  );
}

function blankDraft(name: string, email: string): Draft {
  return {
    personId: null,
    reused: false,
    name,
    email,
    role: '',
    percent: '',
    passport: partsOfField(null),
    passportOk: false,
    sponsor: '',
    sponsorCompany: '',
    visa: partsOfField(null),
    visaOk: false,
    emiratesId: partsOfField(null),
    emiratesIdOk: false,
    files: [],
  };
}

// A person already on the account: their papers come with them; role and sponsor start blank
// when they are new to this company.
function draftOf(person: AccountPerson, role: Role | null, companyId: string): Draft {
  const here = role !== null;
  const sponsor = sponsorChoiceOf(person.residenceVisa.sponsor, companyId);
  return {
    personId: person.id,
    reused: !here,
    name: person.name,
    email: person.email ?? '',
    role: role?.kind ?? '',
    percent: role?.ownershipPercent?.state === 'known' ? String(role.ownershipPercent.value) : '',
    passport: partsOfField(person.passportExpiry),
    passportOk: true,
    sponsor: here ? sponsor.sponsor : '',
    sponsorCompany: here ? sponsor.company : '',
    visa: partsOfField(person.residenceVisa.expiry),
    visaOk: true,
    emiratesId: partsOfField(person.emiratesIdExpiry),
    emiratesIdOk: true,
    files: [],
  };
}

export function StepPeople({ world, facts }: StepProps) {
  const repos = useRepos();
  const refresh = useOnboardingRefresh();
  const finish = useFinishStep();
  const navigate = useNavigate();
  const day = today();
  const companyId = facts.id;
  const here = companyPeople(companyId, world.people, world.roles).filter(
    (entry) => entry.role !== null,
  );
  const link = world.links.find((entry) => entry.companyId === companyId);
  const holder = world.people.find(
    (person) =>
      person.email !== null && person.email.toLowerCase() === world.account.email.toLowerCase(),
  );
  const holderHere = holder !== undefined && here.some((entry) => entry.person.id === holder.id);
  // The owner creating the account is prefilled as the first person (not for an adviser).
  const [draft, setDraft] = useState<Draft | null>(() => {
    if (here.length > 0 || link?.role === 'adviser' || holderHere) {
      return null;
    }
    return holder !== undefined
      ? draftOf(holder, null, companyId)
      : blankDraft(world.account.fullName, world.account.email);
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const roles = world.roles.filter((role) => role.companyId === companyId);
  const picks = pickList(companyId, world.people, world.roles).filter(
    (person) => person.id !== draft?.personId,
  );
  const otherCompanies = world.companies.filter((company) => company.id !== companyId);

  const set = (patch: Partial<Draft>) => {
    setDraft((current) => (current === null ? current : { ...current, ...patch }));
  };

  const resident = draft !== null && draft.sponsor !== '' && draft.sponsor !== 'not-resident';
  const shareholder = draft?.role === 'shareholder' || draft?.role === 'both';

  const draftPerson =
    draft === null
      ? []
      : [
          {
            id: draft.personId ?? 'draft',
            name: draft.name,
            passportExpiry: fieldKeeping(dateEntry(draft.passport), null, day),
            visaExpiry: resident ? fieldKeeping(dateEntry(draft.visa), null, day) : null,
            emiratesIdExpiry: resident
              ? fieldKeeping(dateEntry(draft.emiratesId), null, day)
              : null,
          },
        ];
  const base = snapshotOf(facts, here);
  const snapshot = {
    ...base,
    people: [
      ...here
        .filter((entry) => entry.person.id !== draft?.personId)
        .map((entry) => snapshotPerson(entry.person)),
      ...draftPerson,
    ],
  };

  const check = (current: Draft): DraftErrors => {
    const found: DraftErrors = {};
    if (current.name.trim() === '') {
      found.name = copy.people.fullNameError;
    }
    if (current.email.trim() !== '' && !isEmail(current.email)) {
      found.email = copy.people.emailError;
    }
    if (current.role === '') {
      found.role = copy.people.roleError;
    }
    if (current.role === 'shareholder' || current.role === 'both') {
      const percent = current.percent.trim() === '' ? null : parsePercent(current.percent);
      if (current.percent.trim() !== '' && percent === null) {
        found.percent = copy.people.ownershipError;
      } else if (ownershipTooHigh(roles, { personId: current.personId, percent })) {
        found.percent = copy.people.ownershipTotal;
      }
    }
    if (current.sponsor === '') {
      found.sponsor = copy.people.sponsorError;
    }
    const passport = dateError(current.passport, day, current.passportOk);
    if (passport !== undefined) {
      found.passport = passport;
    }
    if (current.sponsor !== 'not-resident') {
      const visa = dateError(current.visa, day, current.visaOk);
      if (visa !== undefined) {
        found.visa = visa;
      }
      const emiratesId = dateError(current.emiratesId, day, current.emiratesIdOk);
      if (emiratesId !== undefined) {
        found.emiratesId = emiratesId;
      }
    }
    return found;
  };

  const savePerson = async (): Promise<boolean> => {
    if (draft === null) {
      return true;
    }
    const found = check(draft);
    setErrors(found);
    if (Object.keys(found).length > 0 || draft.role === '' || draft.sponsor === '') {
      return false;
    }
    const existing = world.people.find((person) => person.id === draft.personId) ?? null;
    const sponsor: VisaSponsor =
      draft.sponsor === 'this-company'
        ? { kind: 'account-company', companyId }
        : draft.sponsor === 'my-company'
          ? draft.sponsorCompany === NOT_ON_BOASIS || draft.sponsorCompany === ''
            ? { kind: 'own-company-not-on-boasis' }
            : { kind: 'account-company', companyId: draft.sponsorCompany }
          : { kind: draft.sponsor };
    const isResident = sponsor.kind !== 'not-resident';
    const record = {
      accountId: world.account.id,
      name: draft.name.trim(),
      email: draft.email.trim() === '' ? null : draft.email.trim(),
      passportExpiry: fieldKeeping(dateEntry(draft.passport), existing?.passportExpiry, day),
      residenceVisa: {
        sponsor,
        expiry: isResident
          ? fieldKeeping(dateEntry(draft.visa), existing?.residenceVisa.expiry, day)
          : null,
      },
      emiratesIdExpiry: isResident
        ? fieldKeeping(dateEntry(draft.emiratesId), existing?.emiratesIdExpiry, day)
        : null,
    };
    const person =
      existing === null
        ? await repos.accountPeople.create(record)
        : await repos.accountPeople.update(existing.id, record);
    const previousRole = roles.find((role) => role.personId === person.id) ?? null;
    const percent = parsePercent(draft.percent);
    await repos.roles.put({
      personId: person.id,
      companyId,
      kind: draft.role,
      ownershipPercent:
        draft.role === 'manager'
          ? null
          : fieldKeeping(
              percent === null ? { kind: 'later' } : { kind: 'value', value: percent },
              previousRole?.ownershipPercent,
              day,
            ),
    });
    await fileUploads(
      repos,
      companyId,
      draft.files.map((upload) => ({ ...upload, personId: person.id })),
      day,
    );
    await refresh();
    setDraft(null);
    setErrors({});
    return true;
  };

  const next = async (later: boolean) => {
    setFormError(undefined);
    setBusy(true);
    try {
      // A person being added is saved on the way out when the form is valid. Continue stops on an
      // invalid form with its field errors; "I'll add this later" leaves an invalid one behind.
      if (draft !== null && !isBlank(draft)) {
        const saved = await savePerson();
        if (!saved && !later) {
          setBusy(false);
          return;
        }
      }
      const fresh = companyPeople(
        companyId,
        await repos.accountPeople.list(world.account.id),
        await repos.roles.list(companyId),
      );
      await finish(companyId, 'people', peopleItems(fresh), 'office');
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : copy.common.error);
      setBusy(false);
    }
  };

  const passportMonths = federalRules.passport.residenceRenewalMonths.value;
  const back = previousStep('people');

  return (
    <Frame
      step="people"
      title={copy.people.title}
      why={copy.people.why}
      onContinue={() => void next(false)}
      onLater={() => void next(true)}
      onBack={back === null ? undefined : () => void navigate(stepPath(companyId, back))}
      busy={busy}
      error={formError}
      snapshot={snapshot}
    >
      {picks.length > 0 ? (
        <section className="ob-facts" data-testid="people-pick">
          <h2 className="ob-subtitle">{copy.people.pick}</h2>
          <p className="ob-why">{copy.people.pickWhy}</p>
          <div className="ob-choice__row">
            {picks.map((person) => (
              <button
                key={person.id}
                type="button"
                className="ob-btn"
                onClick={() => {
                  setDraft(draftOf(person, null, companyId));
                  setErrors({});
                }}
              >
                {copy.people.pickAdd(person.name)}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <ul className="ob-people" aria-label={copy.people.title}>
        {here.length === 0 && draft === null ? (
          <li className="ob-why">{copy.people.none}</li>
        ) : null}
        {here.map(({ person, role }) =>
          draft?.personId === person.id ? null : (
            <li key={person.id} className="ob-person">
              <span className="ob-person__name">
                {person.name}
                {holder?.id === person.id ? ` (${copy.people.you})` : ''}
              </span>
              <span className="ob-person__role">
                {role === null
                  ? ''
                  : copy.people.rolesLine(
                      copy.people.roles[role.kind],
                      role.ownershipPercent?.state === 'known'
                        ? String(role.ownershipPercent.value)
                        : null,
                    )}
              </span>
              <span className="ob-person__acts">
                <button
                  type="button"
                  className="ob-btn ob-btn--quiet"
                  onClick={() => {
                    setDraft(draftOf(person, role, companyId));
                    setErrors({});
                  }}
                >
                  {copy.people.editPerson}
                </button>
                <button
                  type="button"
                  className="ob-btn ob-btn--quiet"
                  onClick={() => {
                    void repos.roles.remove(person.id, companyId).then(refresh);
                  }}
                >
                  {copy.people.removePerson}
                </button>
              </span>
            </li>
          ),
        )}
      </ul>

      {draft === null ? (
        <div className="ob__actions">
          <button
            type="button"
            className="ob-btn"
            onClick={() => {
              setDraft(blankDraft('', ''));
              setErrors({});
            }}
          >
            {copy.people.addPerson}
          </button>
        </div>
      ) : (
        <section
          className="ob-card"
          aria-label={draft.name === '' ? copy.people.addPerson : draft.name}
          data-testid="person-form"
        >
          {draft.reused ? <p className="ob-why">{copy.people.reused}</p> : null}
          <TextEntry
            label={copy.people.fullName}
            why={copy.people.fullNameWhy}
            required
            value={draft.name}
            onChange={(name) => {
              set({ name });
            }}
            error={errors.name}
          />
          <TextEntry
            label={copy.people.email}
            why={copy.people.emailWhy}
            type="email"
            inputMode="email"
            value={draft.email}
            onChange={(email) => {
              set({ email });
            }}
            error={errors.email}
          />
          <Choice<RoleKind>
            label={copy.people.role}
            why={copy.people.roleWhy}
            required
            value={draft.role}
            error={errors.role}
            options={RoleKind.options.map((value) => ({ value, label: copy.people.roles[value] }))}
            onChange={(role) => {
              set({ role });
            }}
          />
          {shareholder ? (
            <TextEntry
              label={copy.people.ownership}
              why={copy.people.ownershipWhy}
              value={draft.percent}
              inputMode="decimal"
              onChange={(percent) => {
                set({ percent });
              }}
              error={errors.percent}
            />
          ) : null}
          <DateEntry
            label={copy.people.passport}
            why={copy.people.passportWhy(passportMonths)}
            value={draft.passport}
            onChange={(passport) => {
              set({ passport });
            }}
            today={day}
            error={errors.passport}
            confirmed={draft.passportOk}
            onConfirm={(passportOk) => {
              set({ passportOk });
            }}
            testId="passport"
          />
          <Choice<SponsorChoice>
            label={copy.people.sponsor}
            why={copy.people.sponsorWhy}
            required
            value={draft.sponsor}
            error={errors.sponsor}
            options={(
              ['this-company', 'my-company', 'family', 'other-employer', 'not-resident'] as const
            ).map((value) => ({ value, label: copy.people.sponsors[value] }))}
            onChange={(sponsor) => {
              set({ sponsor });
            }}
          />
          {draft.sponsor === 'my-company' ? (
            <Choice<string>
              label={copy.people.whichCompany}
              value={draft.sponsorCompany}
              options={[
                ...otherCompanies.map((company) => ({
                  value: company.id,
                  label: company.identity.tradeName,
                })),
                { value: NOT_ON_BOASIS, label: copy.people.notOnBoasis },
              ]}
              onChange={(sponsorCompany) => {
                set({ sponsorCompany });
              }}
            />
          ) : null}
          {resident ? (
            <>
              <DateEntry
                label={copy.people.visa}
                why={copy.people.visaWhy}
                value={draft.visa}
                onChange={(visa) => {
                  set({ visa });
                }}
                today={day}
                error={errors.visa}
                confirmed={draft.visaOk}
                onConfirm={(visaOk) => {
                  set({ visaOk });
                }}
                testId="visa"
              />
              <DateEntry
                label={copy.people.emiratesId}
                why={copy.people.emiratesIdWhy}
                value={draft.emiratesId}
                onChange={(emiratesId) => {
                  set({ emiratesId });
                }}
                today={day}
                error={errors.emiratesId}
                confirmed={draft.emiratesIdOk}
                onConfirm={(emiratesIdOk) => {
                  set({ emiratesIdOk });
                }}
                testId="emirates-id"
              />
            </>
          ) : null}
          <PersonUploads
            files={draft.files}
            onAdd={(upload) => {
              set({ files: [...draft.files, upload] });
            }}
          />
          <div className="ob__actions">
            <button
              type="button"
              className="ob-btn ob-btn--primary"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void savePerson()
                  .catch((error: unknown) => {
                    setFormError(error instanceof Error ? error.message : copy.common.error);
                    return false;
                  })
                  .finally(() => {
                    setBusy(false);
                  });
              }}
            >
              {copy.people.savePerson}
            </button>
            <button
              type="button"
              className="ob-btn ob-btn--quiet"
              onClick={() => {
                setDraft(null);
                setErrors({});
              }}
            >
              {copy.common.remove}
            </button>
          </div>
        </section>
      )}
    </Frame>
  );
}

function PersonUploads({
  files,
  onAdd,
}: {
  files: Draft['files'];
  onAdd: (upload: Draft['files'][number]) => void;
}) {
  const kinds = [
    { type: 'passport' as const, title: copy.people.passportFile },
    { type: 'visa' as const, title: copy.people.visaFile },
    { type: 'emirates-id' as const, title: copy.people.emiratesIdFile },
  ];
  return (
    <>
      {kinds.map((kind) => (
        <UploadEntry
          key={kind.type}
          label={kind.title}
          files={files.filter((entry) => entry.type === kind.type).map((entry) => entry.file)}
          onAdd={(file) => {
            onAdd({ file, type: kind.type, title: kind.title });
          }}
        />
      ))}
    </>
  );
}
