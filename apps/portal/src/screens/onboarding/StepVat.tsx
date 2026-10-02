import { nextVatReturn, VAT_RETURN_REMINDER_DAYS, vatRegistrationOutcome } from '@boasis/rules';
import { VatFilingPeriod, VatTurnoverBand, type VatRecord, type YesNo } from '@boasis/schema';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { federalRules } from '../../content/federal';
import { useRepos } from '../../data/ReposProvider';
import type { PickedFile } from '../../lib/files';
import { formatLong } from '../../lib/format';
import { fieldKeeping } from '../../lib/onboarding/fields';
import { vatItems } from '../../lib/onboarding/needs';
import { isTrn } from '../../lib/onboarding/people';
import { companyPeople, snapshotOf } from '../../lib/onboarding/snapshot';
import { stepPath } from '../../lib/onboarding/steps';
import { today } from '../../lib/today';
import {
  Choice,
  DateEntry,
  dateError,
  RuleNote,
  Sources,
  TextEntry,
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
import { reminderList } from './StepTax';

// Step 7 (section C step 7): VAT. Registered: the TRN, the filing period and one period end give
// every return date. Not registered: the two legal tests give one of four outcomes. The amounts
// and day counts come from content/federal.json.

export const VAT_GUIDE = '/library/vat';

const AED = new Intl.NumberFormat('en-AE');

export function StepVat({ world, facts }: StepProps) {
  const repos = useRepos();
  const finish = useFinishStep();
  const navigate = useNavigate();
  const day = today();
  const record = facts.tax.vatRecord ?? null;
  const [registered, setRegistered] = useState<WithNotSure<YesNo>>(
    choiceOfField(record?.registered),
  );
  const [trn, setTrn] = useState(record?.trn?.state === 'known' ? record.trn.value : '');
  const [period, setPeriod] = useState<VatFilingPeriod | ''>(
    record?.filingPeriod?.state === 'known' ? record.filingPeriod.value : '',
  );
  const [periodEnd, setPeriodEnd] = useState<DateParts>(partsOfField(record?.periodEnd));
  const [periodEndOk, setPeriodEndOk] = useState(true);
  const [band, setBand] = useState<WithNotSure<VatTurnoverBand>>(
    choiceOfField(record?.last12MonthsBand),
  );
  const [next30, setNext30] = useState<WithNotSure<YesNo>>(
    choiceOfField(record?.expectsToPassMandatoryInNext30Days),
  );
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<{ trn?: string; periodEnd?: string }>({});
  const [busy, setBusy] = useState(false);

  const build = (): VatRecord => {
    const registeredField = fieldKeeping(choiceEntry(registered), record?.registered, day);
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
      filingPeriod: yes
        ? fieldKeeping(
            period === '' ? { kind: 'empty' } : { kind: 'value', value: period },
            record?.filingPeriod,
            day,
          )
        : null,
      periodEnd: yes ? fieldKeeping(dateEntry(periodEnd), record?.periodEnd, day) : null,
      last12MonthsBand: no ? fieldKeeping(choiceEntry(band), record?.last12MonthsBand, day) : null,
      expectsToPassMandatoryInNext30Days: no
        ? fieldKeeping(choiceEntry(next30), record?.expectsToPassMandatoryInNext30Days, day)
        : null,
    };
  };
  const live = build();
  const people = companyPeople(facts.id, world.people, world.roles);
  const snapshot = { ...snapshotOf(facts, people), vat: live };
  const vatReturn = nextVatReturn(
    { filingPeriod: live.filingPeriod, periodEnd: live.periodEnd, today: day },
    federalRules,
  );
  const outcome = vatRegistrationOutcome(
    {
      last12MonthsBand: live.last12MonthsBand,
      expectsToPassMandatoryInNext30Days: live.expectsToPassMandatoryInNext30Days,
    },
    federalRules,
  );
  const {
    mandatoryThresholdAed,
    voluntaryThresholdAed,
    expectedWithinDays,
    applicationWindowDays,
  } = federalRules.vat;
  const mandatory = AED.format(mandatoryThresholdAed.value);
  const voluntary = AED.format(voluntaryThresholdAed.value);
  const bandLabels = copy.vat.bands(voluntary, mandatory);
  const answeredBoth = band !== '' && next30 !== '';

  const save = async (later: boolean) => {
    const found: typeof errors = {};
    if (!later && registered === 'yes') {
      if (trn.trim() !== '' && !isTrn(trn)) {
        found.trn = copy.tax.trnError;
      }
      found.periodEnd = dateError(periodEnd, day, periodEndOk);
    }
    const shown = definedOnly(found);
    setErrors(shown);
    if (Object.keys(shown).length > 0) {
      return;
    }
    setBusy(true);
    const next = build();
    const status =
      next.registered.state !== 'known'
        ? 'unknown'
        : next.registered.value === 'yes'
          ? 'registered'
          : 'not-registered';
    try {
      const saved = await repos.companies.update(facts.id, {
        tax: {
          ...facts.tax,
          vatRecord: next,
          vat: {
            ...facts.tax.vat,
            status,
            trn: next.trn?.state === 'known' ? next.trn.value : null,
            periodEnd: next.periodEnd?.state === 'known' ? next.periodEnd.value : null,
            periodMonths:
              next.filingPeriod?.state === 'known'
                ? next.filingPeriod.value === 'quarterly'
                  ? 3
                  : 1
                : null,
          },
        },
      });
      await fileUploads(
        repos,
        facts.id,
        files.map((file) => ({
          file,
          type: 'tax-certificate' as const,
          title: copy.vat.title,
          personId: null,
        })),
        day,
      );
      await finish(facts.id, 'vat', vatItems(saved), 'your-year');
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
      step="vat"
      title={copy.vat.title}
      onContinue={() => void save(false)}
      onLater={() => void save(true)}
      onBack={() => void navigate(stepPath(facts.id, 'corporate-tax'))}
      busy={busy}
      snapshot={snapshot}
    >
      <Choice<WithNotSure<YesNo>>
        label={copy.vat.question}
        value={registered}
        options={yesNo}
        onChange={setRegistered}
      />

      {registered === 'yes' ? (
        <>
          <TextEntry
            label={copy.vat.trn}
            why={copy.vat.trnWhy}
            value={trn}
            onChange={setTrn}
            inputMode="numeric"
            error={errors.trn}
          />
          <Choice<VatFilingPeriod>
            label={copy.vat.period}
            why={copy.vat.periodWhy}
            value={period}
            options={VatFilingPeriod.options.map((value) => ({
              value,
              label: copy.vat.periods[value],
            }))}
            onChange={setPeriod}
          />
          <DateEntry
            label={copy.vat.periodEnd}
            why={copy.vat.periodEndWhy}
            value={periodEnd}
            onChange={setPeriodEnd}
            today={day}
            error={errors.periodEnd}
            confirmed={periodEndOk}
            onConfirm={setPeriodEndOk}
            testId="vat-period-end"
          />
          {vatReturn.kind === 'dated' ? (
            <RuleNote basis={vatReturn.basis} testId="vat-return">
              {copy.vat.returnDue(formatLong(vatReturn.dueOn))}{' '}
              {copy.vat.returnReminders(reminderList(VAT_RETURN_REMINDER_DAYS))}
            </RuleNote>
          ) : null}
        </>
      ) : null}

      {registered === 'no' ? (
        <>
          <Choice<WithNotSure<VatTurnoverBand>>
            label={copy.vat.band}
            why={copy.vat.bandWhy}
            value={band}
            options={[
              ...VatTurnoverBand.options.map((value) => ({ value, label: bandLabels[value] })),
              { value: NOT_SURE, label: copy.common.notSure },
            ]}
            onChange={setBand}
          />
          <Choice<WithNotSure<YesNo>>
            label={copy.vat.next30(mandatory, expectedWithinDays.value)}
            why={copy.vat.next30Why(mandatory, expectedWithinDays.value)}
            value={next30}
            options={yesNo}
            onChange={setNext30}
          />
          {outcome.outcome === 'mandatory' ? (
            <RuleNote basis={outcome.basis} tone="warn" testId="vat-outcome">
              <strong>{copy.vat.mandatory}</strong> <Link to={VAT_GUIDE}>{copy.vat.guide}</Link>
              <span className="ob-block">
                {copy.vat.window} <Sources basis={[applicationWindowDays]} />
              </span>
            </RuleNote>
          ) : null}
          {outcome.outcome === 'voluntary' ? (
            <RuleNote basis={outcome.basis} testId="vat-outcome">
              <strong>{copy.vat.voluntary}</strong> {copy.vat.noDeadline}{' '}
              <Link to={VAT_GUIDE}>{copy.vat.guide}</Link>
            </RuleNote>
          ) : null}
          {outcome.outcome === 'not-required' ? (
            <RuleNote basis={outcome.basis} testId="vat-outcome">
              <strong>{copy.vat.notRequired}</strong> {copy.vat.monthly(voluntary, mandatory)}
            </RuleNote>
          ) : null}
          {(outcome.outcome === 'unknown' && answeredBoth) ||
          (outcome.outcome !== 'mandatory' && (band === NOT_SURE || next30 === NOT_SURE)) ? (
            <p className="ob-note ob-note--info" data-testid="vat-outcome">
              {copy.vat.askAccountant}
            </p>
          ) : null}
        </>
      ) : null}

      {registered === NOT_SURE ? (
        <div className="ob-note ob-note--info" data-testid="vat-not-sure">
          <div className="ob-note__text">
            <Link to={VAT_GUIDE}>{copy.vat.howToCheck}</Link>
          </div>
          <p className="ob-why">{copy.vat.checkTask}</p>
        </div>
      ) : null}

      <UploadEntry
        label={copy.vat.title}
        files={files}
        onAdd={(file) => {
          setFiles([...files, file]);
        }}
      />
    </Frame>
  );
}
