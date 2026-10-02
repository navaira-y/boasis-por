import {
  CT_REGISTRATION_REMINDER_DAYS,
  corporateTaxRegistration,
  firstTaxPeriod,
  snapshotDates,
  nextCorporateTaxReturn,
  qfzpAudit,
} from '@boasis/rules';
import type { CorporateTaxRecord, IsoDate, MonthDay, YesNo } from '@boasis/schema';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { federalRules } from '../../content/federal';
import { useRepos } from '../../data/ReposProvider';
import type { PickedFile } from '../../lib/files';
import { formatLong } from '../../lib/format';
import { fieldKeeping, type Entry } from '../../lib/onboarding/fields';
import { corporateTaxItems } from '../../lib/onboarding/needs';
import { isTrn } from '../../lib/onboarding/people';
import { companyPeople, snapshotOf } from '../../lib/onboarding/snapshot';
import { stepPath } from '../../lib/onboarding/steps';
import { today } from '../../lib/today';
import {
  Choice,
  DateEntry,
  dateError,
  MonthDayEntry,
  monthDayOf,
  RuleNote,
  TextEntry,
  UnknownRule,
  UploadEntry,
  type DateParts,
} from './controls';
import {
  choiceEntry,
  choiceOfField,
  dateEntry,
  definedOnly,
  fileUploads,
  NOT_SURE,
  partsOfField,
  type WithNotSure,
} from './form';
import { Frame } from './Frame';
import { useFinishStep, type StepProps } from './Onboarding';

// Step 6 (section C step 6): corporate tax. Registered: the TRN, the first period end, the year
// end and the free zone status. Not registered: the deadline from the incorporation date (FTA
// Decision 3 of 2024), late or not, and the waiver line in its gated form. Not sure: how to check,
// and a task.

export const CT_GUIDE = '/library/corporate-tax';

function monthDayEntry(value: { day: string; month: string }): Entry<MonthDay> {
  const monthDay = monthDayOf(value);
  return monthDay.kind === 'date' ? { kind: 'value', value: monthDay.value } : { kind: 'empty' };
}

function monthDayParts(value: MonthDay | null): { day: string; month: string } {
  if (value === null) {
    return { day: '', month: '' };
  }
  const [month = '', day = ''] = value.split('-');
  return { day: String(Number(day)), month: String(Number(month)) };
}

export function reminderList(offsets: readonly number[]): string {
  const values = offsets.map(String);
  return values.length < 2
    ? values.join('')
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1] ?? ''}`;
}

export function StepTax({ world, facts }: StepProps) {
  const repos = useRepos();
  const finish = useFinishStep();
  const navigate = useNavigate();
  const day = today();
  const record = facts.tax.corporateTaxRecord ?? null;
  const [registered, setRegistered] = useState<WithNotSure<YesNo>>(
    choiceOfField(record?.registered),
  );
  const [trn, setTrn] = useState(record?.trn?.state === 'known' ? record.trn.value : '');
  const [firstEnd, setFirstEnd] = useState<DateParts>(partsOfField(record?.firstTaxPeriodEnd));
  const [firstEndOk, setFirstEndOk] = useState(true);
  const [yearEnd, setYearEnd] = useState(
    monthDayParts(
      record?.financialYearEnd?.state === 'known' ? record.financialYearEnd.value : null,
    ),
  );
  // Not registered, two candidate year ends: the one the person picked.
  const [firstChoice, setFirstChoice] = useState<IsoDate>(
    record?.registered.state === 'known' &&
      record.registered.value === 'no' &&
      record.firstTaxPeriodEnd?.state === 'known'
      ? record.firstTaxPeriodEnd.value
      : '',
  );
  const [qfzp, setQfzp] = useState<WithNotSure<YesNo>>(choiceOfField(record?.qfzpIntent));
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<{ trn?: string; firstEnd?: string; yearEnd?: string }>({});
  const [busy, setBusy] = useState(false);

  const build = (): CorporateTaxRecord => {
    const answer = choiceEntry(registered);
    const registeredField = fieldKeeping(answer, record?.registered, day);
    const yes = registeredField.state === 'known' && registeredField.value === 'yes';
    const no = registeredField.state === 'known' && registeredField.value === 'no';
    return {
      registered: registeredField,
      trn: yes
        ? fieldKeeping(
            trn.trim() === ''
              ? { kind: 'later' }
              : { kind: 'value', value: trn.replace(/\s+/g, '') },
            record?.trn,
            day,
          )
        : null,
      firstTaxPeriodEnd: yes
        ? fieldKeeping(dateEntry(firstEnd), record?.firstTaxPeriodEnd, day)
        : no && firstChoice !== ''
          ? fieldKeeping({ kind: 'value', value: firstChoice }, record?.firstTaxPeriodEnd, day)
          : null,
      financialYearEnd:
        yes || no ? fieldKeeping(monthDayEntry(yearEnd), record?.financialYearEnd, day) : null,
      qfzpIntent: yes ? fieldKeeping(choiceEntry(qfzp), record?.qfzpIntent, day) : null,
    };
  };
  const live = build();
  const people = companyPeople(facts.id, world.people, world.roles);
  const snapshot = { ...snapshotOf(facts, people), corporateTax: live };
  const incorporation = facts.profile?.incorporationDate ?? null;
  const registration = corporateTaxRegistration(
    { registered: live.registered, incorporationDate: incorporation, today: day },
    federalRules,
  );
  const taxReturn = nextCorporateTaxReturn(
    {
      firstTaxPeriodEnd: live.firstTaxPeriodEnd,
      financialYearEnd: live.financialYearEnd,
      today: day,
    },
    federalRules,
  );
  const audit = qfzpAudit(live.qfzpIntent, federalRules);
  const firstPeriod = firstTaxPeriod(incorporation, live.financialYearEnd, federalRules);
  const returnItem = snapshotDates(snapshot, federalRules, day).dated.find(
    (entry) => entry.kind === 'corporate-tax-return',
  );
  const consequence = federalRules.corporateTax.lateRegistrationConsequence;

  const save = async (later: boolean) => {
    const found: typeof errors = {};
    if (!later && registered === 'yes') {
      if (trn.trim() !== '' && !isTrn(trn)) {
        found.trn = copy.tax.trnError;
      }
      found.firstEnd = dateError(firstEnd, day, firstEndOk);
    }
    if (!later && monthDayOf(yearEnd).kind === 'partial') {
      found.yearEnd = copy.common.incompleteDate;
    }
    const shown = definedOnly(found);
    setErrors(shown);
    if (Object.keys(shown).length > 0) {
      return;
    }
    setBusy(true);
    const next = build();
    const yes = next.registered.state === 'known' && next.registered.value === 'yes';
    try {
      const saved = await repos.companies.update(facts.id, {
        identity: {
          ...facts.identity,
          financialYearEnd:
            next.financialYearEnd?.state === 'known'
              ? next.financialYearEnd.value
              : facts.identity.financialYearEnd,
        },
        tax: {
          ...facts.tax,
          corporateTaxRecord: next,
          corporateTax: {
            ...facts.tax.corporateTax,
            registered: yes,
            registrationNumber: yes && next.trn?.state === 'known' ? next.trn.value : null,
          },
        },
      });
      await fileUploads(
        repos,
        facts.id,
        files.map((file) => ({
          file,
          type: 'tax-certificate' as const,
          title: copy.tax.title,
          personId: null,
        })),
        day,
      );
      await finish(facts.id, 'corporate-tax', corporateTaxItems(saved), 'vat');
    } catch (failure: unknown) {
      setErrors({ trn: failure instanceof Error ? failure.message : copy.common.error });
      setBusy(false);
    }
  };

  const yesNo = [
    { value: 'yes' as const, label: copy.common.yes },
    { value: 'no' as const, label: copy.common.no },
    { value: NOT_SURE, label: copy.common.notSure },
  ];

  return (
    <Frame
      step="corporate-tax"
      title={copy.tax.title}
      onContinue={() => void save(false)}
      onLater={() => void save(true)}
      onBack={() => void navigate(stepPath(facts.id, 'establishment-card'))}
      busy={busy}
      snapshot={snapshot}
    >
      <Choice<WithNotSure<YesNo>>
        label={copy.tax.question}
        value={registered}
        options={yesNo}
        onChange={setRegistered}
      />

      {registered === 'yes' ? (
        <>
          <TextEntry
            label={copy.tax.trn}
            why={copy.tax.trnWhy}
            value={trn}
            onChange={setTrn}
            inputMode="numeric"
            error={errors.trn}
          />
          <DateEntry
            label={copy.tax.firstPeriodEnd}
            why={copy.tax.firstPeriodEndWhy}
            value={firstEnd}
            onChange={setFirstEnd}
            today={day}
            error={errors.firstEnd}
            confirmed={firstEndOk}
            onConfirm={setFirstEndOk}
            testId="first-period-end"
          />
          <MonthDayEntry
            label={copy.tax.yearEnd}
            why={copy.tax.yearEndWhy}
            value={yearEnd}
            onChange={setYearEnd}
            error={errors.yearEnd}
          />
          {taxReturn.kind === 'dated' ? (
            <RuleNote basis={taxReturn.basis} testId="ct-return">
              {taxReturn.first
                ? copy.tax.firstReturnDue(formatLong(taxReturn.dueOn))
                : copy.tax.returnDue(formatLong(taxReturn.dueOn))}
            </RuleNote>
          ) : (
            <p className="ob-why">{copy.tax.returnUnknown}</p>
          )}
          <Choice<WithNotSure<YesNo>>
            label={copy.tax.qfzp}
            why={copy.tax.qfzpWhy}
            value={qfzp}
            options={yesNo}
            onChange={setQfzp}
          />
          {audit?.required === true ? (
            <RuleNote basis={audit.basis} testId="qfzp-audit">
              {copy.tax.audit} {copy.tax.auditDue}
            </RuleNote>
          ) : null}
        </>
      ) : null}

      {registered === 'no' ? (
        <>
          {registration.kind === 'unknown' ? (
            <div className="ob-note ob-note--warn" data-testid="ct-need-incorporation">
              <div className="ob-note__text">{copy.tax.needIncorporation}</div>
              <button
                type="button"
                className="ob-btn ob-btn--quiet"
                onClick={() => void navigate(stepPath(facts.id, 'company'))}
              >
                {copy.tax.backToLicence}
              </button>
            </div>
          ) : null}
          {registration.kind === 'register-by' ? (
            <RuleNote basis={registration.basis} tone="warn" testId="ct-register-by">
              <strong>{copy.tax.registerBy(formatLong(registration.dueOn))}</strong>{' '}
              {copy.tax.registerReminders(reminderList(CT_REGISTRATION_REMINDER_DAYS))}{' '}
              <Link to={CT_GUIDE}>{copy.tax.howToRegister}</Link>
            </RuleNote>
          ) : null}
          {registration.kind === 'late' ? (
            <div data-testid="ct-late">
              <RuleNote basis={registration.basis} tone="late">
                <strong>{copy.tax.late}</strong>
              </RuleNote>
              <RuleNote
                basis={[
                  {
                    source: consequence.source,
                    lastChecked: consequence.lastChecked,
                    grade: consequence.grade,
                  },
                ]}
                tone="late"
              >
                {consequence.value}
              </RuleNote>
              <p className="ob-why">
                <Link to={CT_GUIDE}>{copy.tax.registerNow}</Link>
              </p>
              <p className="ob-note ob-note--info" data-testid="ct-waiver">
                {copy.tax.waiver}
              </p>
            </div>
          ) : null}
          <MonthDayEntry
            label={copy.tax.yearEnd}
            why={copy.tax.thenYearEnd}
            value={yearEnd}
            onChange={setYearEnd}
            error={errors.yearEnd}
          />
          {firstPeriod.kind === 'choose' ? (
            <Choice<IsoDate>
              label={copy.tax.whichFirstPeriod}
              why={copy.tax.whichFirstPeriodWhy}
              value={firstPeriod.candidates.includes(firstChoice) ? firstChoice : ''}
              options={firstPeriod.candidates.map((date) => ({
                value: date,
                label: formatLong(date),
              }))}
              onChange={setFirstChoice}
            />
          ) : null}
          {returnItem !== undefined ? (
            <RuleNote basis={returnItem.basis} testId="ct-return">
              {returnItem.calculated === true
                ? copy.tax.calculatedReturn(formatLong(returnItem.dueOn), returnItem.first === true)
                : returnItem.first === true
                  ? copy.tax.firstReturnDue(formatLong(returnItem.dueOn))
                  : copy.tax.returnDue(formatLong(returnItem.dueOn))}{' '}
              {copy.tax.confirmedOnRegister}
            </RuleNote>
          ) : monthDayOf(yearEnd).kind === 'date' && firstPeriod.kind !== 'choose' ? (
            <UnknownRule who={copy.who.accountant} />
          ) : null}
          {returnItem === undefined &&
          monthDayOf(yearEnd).kind === 'date' &&
          firstPeriod.kind === 'unknown' ? (
            <p className="ob-why" data-testid="ct-first-unknown">
              {copy.tax.firstPeriodUnknown}
            </p>
          ) : null}
        </>
      ) : null}

      {registered === NOT_SURE ? (
        <div className="ob-note ob-note--info" data-testid="ct-not-sure">
          <div className="ob-note__text">
            <Link to={CT_GUIDE}>{copy.tax.howToCheck}</Link>
          </div>
          <p className="ob-why">{copy.tax.checkTask}</p>
        </div>
      ) : null}

      <UploadEntry
        label={copy.tax.title}
        files={files}
        onAdd={(file) => {
          setFiles([...files, file]);
        }}
      />
    </Frame>
  );
}
