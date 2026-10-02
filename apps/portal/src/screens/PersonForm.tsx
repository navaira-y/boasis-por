import type { Person } from '@boasis/schema';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { DateField, TextField } from '../components';
import { screens } from '../copy/en';
import { queryKeys, useRepos } from '../data';
import type { NewRecord } from '../data';
import { todayIso } from '../lib/today';

const copy = screens.people;

interface FormState {
  name: string;
  role: string;
  nationality: string;
  emiratesId: string;
  passportNumber: string;
  visaExpiry: string;
  passportExpiry: string;
  insuranceEnd: string;
}

function fromPerson(person: Person | null): FormState {
  return {
    name: person?.identity.name ?? '',
    role: person?.identity.role ?? '',
    nationality: person?.identity.nationality ?? '',
    emiratesId: person?.status.emiratesIdNumber ?? '',
    passportNumber: person?.identity.passportNumber ?? '',
    visaExpiry: person?.status.visaExpiry ?? '',
    passportExpiry: person?.identity.passportExpiry ?? '',
    insuranceEnd: person?.cover.healthInsurance?.endDate ?? '',
  };
}

const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

// A new person from the form: the fields lite asks for, the rest of the spec 6.1 record left
// empty until the person page fills it. The stage follows the dates: a visa expiry means the
// residence visa is issued; otherwise the chain starts at the quota check.
function newPerson(companyId: string, form: FormState): NewRecord<Person> {
  const visaExpiry = orNull(form.visaExpiry);
  const insuranceEnd = orNull(form.insuranceEnd);
  return {
    companyId,
    identity: {
      name: form.name.trim(),
      nationality: form.nationality.trim(),
      passportNumber: form.passportNumber.trim(),
      passportIssue: null,
      passportExpiry: orNull(form.passportExpiry),
      dateOfBirth: null,
      role: form.role.trim(),
      startDate: null,
      emirateOfWork: '',
      language: 'en',
      noticeConsent: false,
    },
    status: {
      type: 'employee',
      sponsor: { kind: 'company', personId: null },
      mohrePermitType: null,
      stage: visaExpiry === null ? 'quota-check' : 'residence-visa',
      entryPermitIssuedOn: null,
      entryDate: null,
      visaNumber: null,
      unifiedNumber: null,
      visaExpiry,
      emiratesIdNumber: orNull(form.emiratesId),
      emiratesIdExpiry: null,
      workPermitExpiry: null,
      contractType: null,
      noticePeriodDays: null,
      contractStart: null,
      contractEnd: null,
      probationEnd: null,
      leaveBalanceDays: null,
      lastExitDate: null,
    },
    cover: {
      healthInsurance:
        insuranceEnd === null
          ? null
          : { policyNumber: '', endDate: insuranceEnd, paidBy: 'employer' },
      unemploymentInsurance: null,
    },
    pay: {
      basicSalaryAed: null,
      totalSalaryAed: null,
      payDay: null,
      underWps: null,
      endOfServiceAccruedAed: null,
    },
    contact: { email: null, phone: null },
    notify: false,
  };
}

function patched(person: Person, form: FormState): Person {
  const insuranceEnd = orNull(form.insuranceEnd);
  const visaExpiry = orNull(form.visaExpiry);
  return {
    ...person,
    identity: {
      ...person.identity,
      name: form.name.trim(),
      role: form.role.trim(),
      nationality: form.nationality.trim(),
      passportNumber: form.passportNumber.trim(),
      passportExpiry: orNull(form.passportExpiry),
    },
    status: {
      ...person.status,
      emiratesIdNumber: orNull(form.emiratesId),
      visaExpiry,
      // A visa expiry typed on a person still at the start of the chain means the visa exists.
      stage:
        visaExpiry !== null && person.status.stage === 'quota-check'
          ? 'residence-visa'
          : person.status.stage,
    },
    cover: {
      ...person.cover,
      healthInsurance:
        insuranceEnd === null
          ? null
          : {
              policyNumber: person.cover.healthInsurance?.policyNumber ?? '',
              endDate: insuranceEnd,
              paidBy: person.cover.healthInsurance?.paidBy ?? 'employer',
            },
    },
  };
}

export interface PersonFormProps {
  readonly person: Person | null;
  readonly companyId: string;
  readonly onDone: (saved: Person) => void;
  readonly onCancel: () => void;
}

// Lite's add and edit form for a person, ported: the same pairs of fields in the same order,
// plus the passport number the spec 6.1 identity needs.
export function PersonForm({ person, companyId, onDone, onCancel }: PersonFormProps) {
  const repos = useRepos();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => fromPerson(person));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Spec 6.3 "Leave the company": a confirm step with the leaving date, today unless changed.
  const [leftOn, setLeftOn] = useState<string | null>(null);
  const set = (fields: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...fields }));
  };
  const ready = form.name.trim() !== '' && form.passportNumber.trim() !== '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    setError('');
    const write =
      person === null
        ? repos.people.create(newPerson(companyId, form))
        : repos.people.update(person.id, patched(person, form));
    write
      .then(async (saved) => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.people(companyId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.person(saved.id) });
        setBusy(false);
        onDone(saved);
      })
      .catch((failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      });
  };

  // The contract end is the leaving date; the record stays.
  const leave = () => {
    if (person === null || leftOn === null || leftOn === '' || busy) {
      return;
    }
    setBusy(true);
    setError('');
    repos.people
      .update(person.id, { status: { ...person.status, contractEnd: leftOn } })
      .then(async (saved) => {
        await queryClient.invalidateQueries({ queryKey: queryKeys.people(companyId) });
        await queryClient.invalidateQueries({ queryKey: queryKeys.person(saved.id) });
        setBusy(false);
        onDone(saved);
      })
      .catch((failure: unknown) => {
        setBusy(false);
        setError(failure instanceof Error ? failure.message : String(failure));
      });
  };

  return (
    <form className="visaform" onSubmit={submit}>
      <div className="fpair">
        <TextField
          id="v-name"
          label={copy.holder}
          value={form.name}
          placeholder={copy.holderPlaceholder}
          required
          onChange={(name) => {
            set({ name });
          }}
        />
        <TextField
          id="v-job"
          label={copy.job}
          value={form.role}
          placeholder={copy.jobPlaceholder}
          onChange={(role) => {
            set({ role });
          }}
        />
      </div>
      <div className="fpair">
        <TextField
          id="v-nat"
          label={copy.nationality}
          value={form.nationality}
          placeholder={copy.nationalityPlaceholder}
          onChange={(nationality) => {
            set({ nationality });
          }}
        />
        <TextField
          id="v-eid"
          label={copy.emiratesId}
          value={form.emiratesId}
          placeholder={copy.emiratesIdPlaceholder}
          onChange={(emiratesId) => {
            set({ emiratesId });
          }}
        />
      </div>
      <div className="fpair">
        <TextField
          id="v-passno"
          label={copy.passportNumber}
          value={form.passportNumber}
          required
          onChange={(passportNumber) => {
            set({ passportNumber });
          }}
        />
        <DateField
          id="v-exp"
          label={copy.expires}
          value={form.visaExpiry}
          onChange={(visaExpiry) => {
            set({ visaExpiry });
          }}
        />
      </div>
      <div className="fpair">
        <DateField
          id="v-pass"
          label={copy.passportExpires}
          value={form.passportExpiry}
          help={copy.passportNote}
          onChange={(passportExpiry) => {
            set({ passportExpiry });
          }}
        />
        <DateField
          id="v-ins"
          label={copy.insuranceExpires}
          value={form.insuranceEnd}
          help={copy.insuranceNote}
          onChange={(insuranceEnd) => {
            set({ insuranceEnd });
          }}
        />
      </div>

      {error !== '' ? (
        <div className="ferr" role="alert">
          {error}
        </div>
      ) : null}

      {person !== null && leftOn !== null ? (
        <>
          <p>{copy.removeSure(person.identity.name)}</p>
          <DateField id="v-left" label={copy.leftOn} value={leftOn} required onChange={setLeftOn} />
          <div className="formfoot">
            <button className="p" type="button" disabled={leftOn === '' || busy} onClick={leave}>
              {busy ? screens.common.saving : copy.removeConfirm}
            </button>
            <button
              className="g"
              type="button"
              onClick={() => {
                setLeftOn(null);
              }}
            >
              {copy.removeKeep}
            </button>
          </div>
        </>
      ) : (
        <div className="formfoot">
          <button className="p" type="submit" disabled={!ready || busy}>
            {busy ? screens.common.saving : screens.common.save}
          </button>
          <button className="g" type="button" onClick={onCancel}>
            {screens.common.close}
          </button>
          {person !== null ? (
            <button
              className="g"
              type="button"
              style={{ marginInlineStart: 'auto' }}
              onClick={() => {
                setLeftOn(todayIso());
              }}
            >
              {copy.remove}
            </button>
          ) : null}
        </div>
      )}
    </form>
  );
}
