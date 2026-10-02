import type { Document } from '@boasis/schema';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { federalRules } from '../../content/federal';
import { useOnboardingRefresh } from '../../data/onboarding';
import { useRepos } from '../../data/ReposProvider';
import type { PickedFile } from '../../lib/files';
import { fieldKeeping, knownField } from '../../lib/onboarding/fields';
import { employeeItems, peopleItems } from '../../lib/onboarding/needs';
import {
  companyPeople,
  snapshotOf,
  snapshotPerson,
  sponsoredCount,
} from '../../lib/onboarding/snapshot';
import { stepPath } from '../../lib/onboarding/steps';
import { today } from '../../lib/today';
import { DateEntry, dateError, TextEntry, UploadEntry, type DateParts } from './controls';
import { dateEntry, fileUploads, partsOfField } from './form';
import { Frame } from './Frame';
import { type StepProps } from './Onboarding';

// Step 9 (section C step 9): employees on visas, offered after the year and skippable. Visa dates
// only; the sponsor is this company, so each one takes a place in its quota and "visas used"
// moves with them. No contracts, salary or WPS.

interface Draft {
  readonly name: string;
  readonly passport: DateParts;
  readonly passportOk: boolean;
  readonly visa: DateParts;
  readonly visaOk: boolean;
  readonly emiratesId: DateParts;
  readonly emiratesIdOk: boolean;
  readonly files: readonly { file: PickedFile; type: Document['type']; title: string }[];
}

const BLANK: Draft = {
  name: '',
  passport: partsOfField(null),
  passportOk: false,
  visa: partsOfField(null),
  visaOk: false,
  emiratesId: partsOfField(null),
  emiratesIdOk: false,
  files: [],
};

export function StepEmployees({ world, facts }: StepProps) {
  const repos = useRepos();
  const refresh = useOnboardingRefresh();
  const navigate = useNavigate();
  const day = today();
  const people = companyPeople(facts.id, world.people, world.roles);
  const employees = people.filter((entry) => entry.role === null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [errors, setErrors] = useState<{
    name?: string;
    passport?: string;
    visa?: string;
    emiratesId?: string;
  }>({});
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  const snapshot = snapshotOf(facts, people);

  const add = async () => {
    const found = {
      name: draft.name.trim() === '' ? copy.people.fullNameError : undefined,
      passport: dateError(draft.passport, day, draft.passportOk),
      visa: dateError(draft.visa, day, draft.visaOk),
      emiratesId: dateError(draft.emiratesId, day, draft.emiratesIdOk),
    };
    const shown = Object.fromEntries(
      Object.entries(found).filter(([, value]) => value !== undefined),
    );
    setErrors(shown);
    if (Object.keys(shown).length > 0) {
      return;
    }
    setBusy(true);
    try {
      const person = await repos.accountPeople.create({
        accountId: world.account.id,
        name: draft.name.trim(),
        email: null,
        passportExpiry: fieldKeeping(dateEntry(draft.passport), null, day),
        residenceVisa: {
          sponsor: { kind: 'account-company', companyId: facts.id },
          expiry: fieldKeeping(dateEntry(draft.visa), null, day),
        },
        emiratesIdExpiry: fieldKeeping(dateEntry(draft.emiratesId), null, day),
      });
      await fileUploads(
        repos,
        facts.id,
        draft.files.map((upload) => ({ ...upload, personId: person.id })),
        day,
      );
      // Visas used moves up with the people this company sponsors; an answer already higher
      // (it may have counted employees not added here) is kept.
      const all = [...people, { person, role: null }];
      const counted = sponsoredCount(facts.id, all);
      const current = facts.visaQuota?.used;
      const used = current?.state === 'known' ? Math.max(current.value, counted) : counted;
      const quota = {
        allowed: facts.visaQuota?.allowed ?? {
          state: 'skipped' as const,
          value: null,
          origin: 'user' as const,
          enteredOn: day,
        },
        used:
          current?.state === 'known' && current.value === used ? current : knownField(used, day),
      };
      await repos.companies.update(facts.id, {
        visaQuota: quota,
        visaCapacity: { ...facts.visaCapacity, used },
      });
      await repos.onboarding.syncTasks(
        facts.id,
        [...peopleItems(all).filter((item) => item.item !== 'people'), ...employeeItems(all)],
        ['passport-expiry', 'visa-expiry', 'emirates-id-expiry'],
      );
      await refresh();
      setDraft(BLANK);
    } catch (failure: unknown) {
      setErrors({ name: failure instanceof Error ? failure.message : copy.common.error });
    } finally {
      setBusy(false);
    }
  };

  const months = federalRules.passport.residenceRenewalMonths.value;
  return (
    <Frame
      step="employees"
      title={copy.employees.title}
      why={copy.employees.why}
      continueLabel={copy.employees.add}
      onContinue={() => void add()}
      onBack={() => void navigate(stepPath(facts.id, 'your-year'))}
      busy={busy}
      snapshot={{ ...snapshot, people: people.map((entry) => snapshotPerson(entry.person)) }}
    >
      <ul className="ob-people" aria-label={copy.employees.title} data-testid="employees">
        {employees.length === 0 ? <li className="ob-why">{copy.employees.none}</li> : null}
        {employees.map(({ person }) => (
          <li key={person.id} className="ob-person">
            <span className="ob-person__name">{person.name}</span>
          </li>
        ))}
      </ul>
      <TextEntry
        label={copy.employees.fullName}
        why={copy.employees.fullNameWhy}
        required
        value={draft.name}
        onChange={(name) => {
          set({ name });
        }}
        error={errors.name}
      />
      <DateEntry
        label={copy.people.passport}
        why={copy.employees.passportWhy(months)}
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
      />
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
      />
      {(
        [
          { type: 'passport', title: copy.people.passportFile },
          { type: 'visa', title: copy.people.visaFile },
          { type: 'emirates-id', title: copy.people.emiratesIdFile },
        ] as const
      ).map((kind) => (
        <UploadEntry
          key={kind.type}
          label={kind.title}
          files={draft.files.filter((entry) => entry.type === kind.type).map((entry) => entry.file)}
          onAdd={(file) => {
            set({ files: [...draft.files, { file, type: kind.type, title: kind.title }] });
          }}
        />
      ))}
      <div className="ob__actions">
        <button
          type="button"
          className="ob-btn"
          onClick={() => void navigate(stepPath(facts.id, 'your-year'))}
        >
          {copy.employees.done}
        </button>
      </div>
    </Frame>
  );
}
