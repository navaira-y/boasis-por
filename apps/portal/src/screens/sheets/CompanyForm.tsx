import type { AuthorityIndexEntry, CompanyFacts, LegalForm, VatStatus } from '@boasis/schema';
import { withIncorporationDate } from '@boasis/rules';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DateField, Field, TextField } from '../../components/Field/Field';
import { Picker } from '../../components/Picker/Picker';
import { Swatches } from '../../components/Swatches/Swatches';
import { cx } from '../../components/shared/cx';
import { en } from '../../copy/en';
import { useRefresh } from '../../data/bundles';
import { useCompanies } from '../../data/hooks';
import { listAuthorities } from '../../data/content';
import { useRepos } from '../../data/ReposProvider';
import { colourSlotOf, firstFreeSlot } from '../../lib/companyColours';
import { today } from '../../lib/today';
import './sheets.css';

// Lite's licence form, shared by the company sheet and the reader confirmation of the add
// company flow: the same fields, the same write, whichever way in was taken.

type Kind = 'free-zone' | 'mainland';
const KINDS: readonly Kind[] = ['free-zone', 'mainland'];

const LEGAL_FORMS: Readonly<Record<Kind, readonly { value: LegalForm; label: string }[]>> = {
  'free-zone': [
    { value: 'fze', label: 'FZE' },
    { value: 'fzco', label: 'FZCO' },
    { value: 'free-zone-llc', label: 'FZ-LLC' },
    { value: 'branch', label: 'Branch' },
  ],
  mainland: [
    { value: 'llc', label: 'LLC' },
    { value: 'sole-establishment', label: 'Sole establishment' },
    { value: 'branch', label: 'Branch' },
  ],
};

interface Form {
  kind: Kind;
  authority: string;
  name: string;
  legalForm: LegalForm | '';
  licenceNumber: string;
  issuedOn: string;
  expiresOn: string;
  incorporatedOn: string;
  // A full date in the input; only the month and day are kept (schema: MM-DD).
  yearEnd: string;
  vatRegistered: boolean;
  vatPeriodMonths: 1 | 3;
  vatPeriodEnd: string;
  // The company colour the person picked, a palette key; null until they pick one, when the
  // first colour no other company wears is the one shown and saved.
  colourSlot: number | null;
}

function kindOf(entry: AuthorityIndexEntry | undefined): Kind {
  return entry?.type.value === 'mainland' ? 'mainland' : 'free-zone';
}

function fromFacts(facts: CompanyFacts | null, entries: readonly AuthorityIndexEntry[]): Form {
  const entry = entries.find((candidate) => candidate.id === facts?.identity.authority);
  const year = today().slice(0, 4);
  return {
    kind: kindOf(entry),
    authority: facts?.identity.authority ?? '',
    name: facts?.identity.tradeName ?? '',
    legalForm: facts?.identity.legalForm ?? '',
    licenceNumber: facts?.identity.licenceNumber ?? '',
    issuedOn: facts?.identity.issueDate ?? '',
    expiresOn: facts?.identity.expiryDate ?? '',
    incorporatedOn: facts?.identity.incorporationDate ?? '',
    yearEnd: facts === null ? '' : `${year}-${facts.identity.financialYearEnd}`,
    vatRegistered: facts?.tax.vat.status === 'registered',
    vatPeriodMonths: facts?.tax.vat.periodMonths === 1 ? 1 : 3,
    vatPeriodEnd: facts?.tax.vat.periodEnd ?? '',
    colourSlot: null,
  };
}

export interface CompanyFormState {
  readonly form: Form;
  readonly set: (fields: Partial<Form>) => void;
  readonly chooseKind: (kind: Kind) => void;
  readonly options: readonly { value: string; label: string; note?: string }[];
  readonly ready: boolean;
  readonly busy: boolean;
  readonly error: string;
  readonly editing: boolean;
  // The colour a new company will be saved with.
  readonly colourSlot: number;
  readonly submit: (onSaved: (saved: CompanyFacts) => void) => Promise<void>;
}

export function useCompanyForm(facts: CompanyFacts | null): CompanyFormState {
  const repos = useRepos();
  const refresh = useRefresh();
  const authorities = useQuery({ queryKey: ['authorities'], queryFn: listAuthorities });
  const companies = useCompanies();
  const entries = authorities.data ?? [];
  const editing = facts !== null;
  const [form, setForm] = useState<Form>(() => fromFacts(facts, entries));
  const [seeded, setSeeded] = useState(entries.length > 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The kind of an existing company comes from the index, which may arrive after the form.
  if (!seeded && entries.length > 0) {
    setSeeded(true);
    setForm(fromFacts(facts, entries));
  }

  const set = (fields: Partial<Form>) => {
    setForm((current) => ({ ...current, ...fields }));
  };

  const chooseKind = (kind: Kind) => {
    set({ kind, authority: '', legalForm: '' });
  };

  const options = entries
    .filter((entry) => kindOf(entry) === form.kind)
    .map((entry) => ({
      value: entry.id,
      label: entry.name.value ?? entry.id,
      note: entry.emirate.value ?? undefined,
    }));

  // Assigned at registration: the first colour no other company of the owner wears.
  const colourSlot =
    form.colourSlot ??
    firstFreeSlot((companies.data ?? []).map((company) => colourSlotOf(company)));

  const ready =
    form.name.trim() !== '' &&
    form.authority !== '' &&
    form.licenceNumber.trim() !== '' &&
    form.issuedOn !== '' &&
    form.expiresOn !== '' &&
    form.incorporatedOn !== '' &&
    form.yearEnd !== '';

  function incorporationPatch(next: CompanyFacts): Pick<CompanyFacts, 'identity' | 'profile'> {
    return next.profile === undefined
      ? { identity: next.identity }
      : { identity: next.identity, profile: next.profile };
  }

  async function submit(onSaved: (saved: CompanyFacts) => void) {
    if (!ready || busy) {
      return;
    }
    setBusy(true);
    setError('');
    const vatStatus: VatStatus = form.vatRegistered ? 'registered' : 'not-registered';
    const identity = {
      // Keeps the identity fields this form does not edit (category, registered office, first
      // tax period, MOHRE classification).
      ...facts?.identity,
      tradeName: form.name.trim(),
      legalForm: form.legalForm === '' ? ('unknown' as const) : form.legalForm,
      authority: form.authority,
      licenceNumber: form.licenceNumber.trim(),
      issueDate: form.issuedOn,
      expiryDate: form.expiresOn,
      activities: facts?.identity.activities ?? [],
      incorporationDate: form.incorporatedOn,
      financialYearEnd: form.yearEnd.slice(5),
    };
    const vat = {
      status: vatStatus,
      trn: facts?.tax.vat.trn ?? null,
      periodMonths: form.vatRegistered ? form.vatPeriodMonths : null,
      periodEnd: form.vatRegistered && form.vatPeriodEnd !== '' ? form.vatPeriodEnd : null,
    };
    try {
      const saved = editing
        ? await repos.companies.update(facts.id, {
            // Through the one writer, so an onboarding answer and the identity never differ.
            ...incorporationPatch(
              withIncorporationDate(
                { ...facts, identity },
                {
                  state: 'known',
                  value: form.incorporatedOn,
                  origin: 'user',
                  enteredOn: today(),
                },
              ),
            ),
            tax: { ...facts.tax, vat },
          })
        : await repos.companies.create({
            identity,
            cards: { immigrationCard: null, mohreCard: null },
            tax: {
              corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
              vat,
            },
            visaCapacity: { allowed: 0, used: 0 },
            brand: { colourSlot, logoDataUrl: null },
          });
      await refresh();
      setBusy(false);
      onSaved(saved);
    } catch (failure: unknown) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }

  return { form, set, chooseKind, options, ready, busy, error, editing, colourSlot, submit };
}

// The fields, grouped by where the information comes from on the paper. A note above the
// first field says why the fields are empty when a file could not be read.
export function CompanyFields({
  state,
  readNote,
}: {
  readonly state: CompanyFormState;
  readonly readNote?: string;
}) {
  const { form, set, chooseKind, options, error, editing, colourSlot } = state;
  return (
    <>
      {readNote !== undefined && readNote !== '' ? (
        <div className="sheet-fnote sheet-fnote--warn">{readNote}</div>
      ) : null}

      <div className="fgrp">
        <div className="fk">{en.addCompany.whereRegistered}</div>
        <div className="kinds">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={cx('kind', form.kind === kind && 'kind--on')}
              onClick={() => {
                chooseKind(kind);
              }}
            >
              <span className="kind__t">{en.kind[kind]}</span>
              <span className="kind__s">{en.kind[`${kind}Note`]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="fgrp">
        <div className="fk">{en.addCompany.authority}</div>
        <Field label={en.addCompany.authority} htmlFor="co-authority">
          <Picker
            id="co-authority"
            label={en.addCompany.authority}
            value={form.authority === '' ? null : form.authority}
            placeholder={en.addCompany.chooseAuthority}
            options={options}
            onChange={(authority) => {
              set({ authority });
            }}
          />
        </Field>
      </div>

      <div className="fgrp">
        <div className="fk">{en.addCompany.onTheLicence}</div>
        <TextField
          id="co-name"
          label={en.addCompany.legalName}
          value={form.name}
          onChange={(name) => {
            set({ name });
          }}
          placeholder="Nomadventures FZ-LLC"
          help={en.addCompany.legalNameHint}
        />
        <div className="fpair">
          <Field label={en.addCompany.legalForm} htmlFor="co-form">
            <Picker
              id="co-form"
              label={en.addCompany.legalForm}
              value={form.legalForm === '' ? null : form.legalForm}
              placeholder=""
              options={LEGAL_FORMS[form.kind]}
              onChange={(legalForm) => {
                set({ legalForm });
              }}
            />
          </Field>
          <TextField
            id="co-number"
            label={en.addCompany.licenceNumber}
            value={form.licenceNumber}
            onChange={(licenceNumber) => {
              set({ licenceNumber });
            }}
            placeholder="1234567"
          />
        </div>
      </div>

      <div className="fgrp">
        <div className="fk">{en.addCompany.dates}</div>
        <div className="fpair">
          <DateField
            id="co-issued"
            label={en.addCompany.issuedOn}
            value={form.issuedOn}
            onChange={(issuedOn) => {
              set({ issuedOn });
            }}
          />
          <DateField
            id="co-expires"
            label={en.addCompany.expiresOn}
            value={form.expiresOn}
            onChange={(expiresOn) => {
              set({ expiresOn });
            }}
          />
        </div>
        <div className="fpair">
          <DateField
            id="co-incorporated"
            label={en.addCompany.incorporatedOn}
            value={form.incorporatedOn}
            onChange={(incorporatedOn) => {
              set({ incorporatedOn });
            }}
          />
          <DateField
            id="co-fye"
            label={en.addCompany.yearEnd}
            value={form.yearEnd}
            onChange={(yearEnd) => {
              set({ yearEnd });
            }}
            help={en.addCompany.yearEndHint}
          />
        </div>
      </div>

      <div className="fgrp">
        <div className="fk">{en.addCompany.vat}</div>
        <button
          type="button"
          className={cx('vat', form.vatRegistered && 'vat--on')}
          role="switch"
          aria-checked={form.vatRegistered}
          onClick={() => {
            set({ vatRegistered: !form.vatRegistered });
          }}
        >
          <span className="vat__bd">
            <span className="vat__t">{en.addCompany.vatRegistered}</span>
            <span className="vat__s">{en.addCompany.vatNote}</span>
          </span>
          <span className="vat__sw" aria-hidden="true" />
        </button>
        {form.vatRegistered ? (
          <div className="fpair">
            <Field label={en.addCompany.vatPeriod} htmlFor="co-vat-period">
              <Picker
                id="co-vat-period"
                label={en.addCompany.vatPeriod}
                value={form.vatPeriodMonths === 1 ? 'monthly' : 'quarterly'}
                options={[
                  { value: 'quarterly', label: en.addCompany.quarterly },
                  { value: 'monthly', label: en.addCompany.monthly },
                ]}
                onChange={(period) => {
                  set({ vatPeriodMonths: period === 'monthly' ? 1 : 3 });
                }}
              />
            </Field>
            <DateField
              id="co-vat-end"
              label={en.answers.vatPeriodEnd}
              value={form.vatPeriodEnd}
              onChange={(vatPeriodEnd) => {
                set({ vatPeriodEnd });
              }}
              help={en.answers.vatPeriodEndHint}
            />
          </div>
        ) : null}
      </div>

      {editing ? null : (
        <div className="fgrp">
          <div className="fk">{en.addCompany.colour}</div>
          <Swatches
            label={en.addCompany.colour}
            value={colourSlot}
            onChange={(slot) => {
              set({ colourSlot: slot });
            }}
          />
        </div>
      )}

      {error !== '' ? (
        <div className="sheet-ferr" role="alert">
          {error}
        </div>
      ) : null}
    </>
  );
}
