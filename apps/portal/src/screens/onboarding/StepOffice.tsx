import {
  businessCentreLeaseMinimum,
  leaseEndsBeforeLicence,
  leaseRequiredToRenew,
  licenceRenewalDate,
} from '@boasis/rules';
import { OfficeKind, type PremisesRecord, type YesNo } from '@boasis/schema';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import type { PickedFile } from '../../lib/files';
import { fieldKeeping } from '../../lib/onboarding/fields';
import { officeItems } from '../../lib/onboarding/needs';
import { companyPeople, snapshotOf } from '../../lib/onboarding/snapshot';
import { stepPath } from '../../lib/onboarding/steps';
import { today } from '../../lib/today';
import { useRepos } from '../../data/ReposProvider';
import { Choice, DateEntry, dateError, RuleNote, UploadEntry, type DateParts } from './controls';
import {
  choiceEntry,
  choiceOfField,
  dateEntry,
  fileUploads,
  NOT_SURE,
  partsOfField,
  type WithNotSure,
} from './form';
import { Frame } from './Frame';
import { useFinishStep, type StepProps } from './Onboarding';
import { zoneName } from './StepLicence';

// Step 4 (section C step 4): the office. The lease reminders run before the licence ones; a lease
// that ends before the licence gets the zone's wording where the rule is confirmed, and "check
// with your zone" everywhere else.

export function StepOffice({ world, facts, authority, zone }: StepProps) {
  const repos = useRepos();
  const finish = useFinishStep();
  const navigate = useNavigate();
  const day = today();
  const premises = facts.premises ?? null;
  const [type, setType] = useState<WithNotSure<OfficeKind>>(choiceOfField(premises?.type));
  const [end, setEnd] = useState<DateParts>(partsOfField(premises?.endDate));
  const [endOk, setEndOk] = useState(true);
  const [renews, setRenews] = useState<WithNotSure<YesNo>>(
    choiceOfField(premises?.renewsWithLicence),
  );
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const zoneLabel = zoneName(zone, facts.identity.authority);

  const record = (): PremisesRecord => ({
    type: fieldKeeping(choiceEntry(type), premises?.type, day),
    endDate: fieldKeeping(
      type === 'none' ? { kind: 'later' } : dateEntry(end),
      premises?.endDate,
      day,
    ),
    renewsWithLicence: fieldKeeping(
      type === 'none' ? { kind: 'later' } : choiceEntry(renews),
      premises?.renewsWithLicence,
      day,
    ),
  });
  const live = record();
  const people = companyPeople(facts.id, world.people, world.roles);
  const snapshot = { ...snapshotOf(facts, people), premises: live };
  const profile = facts.profile ?? null;
  const licenceExpiry = licenceRenewalDate(
    profile?.licenceStatus,
    profile?.licenceExpiryDate,
    profile?.expectedNewExpiry,
  );
  const leaseRule = leaseRequiredToRenew(authority);
  const before = leaseEndsBeforeLicence(live.endDate, licenceExpiry);
  const minimum = businessCentreLeaseMinimum(
    authority,
    live.type.state === 'known' ? live.type.value : null,
  );

  const save = async (later: boolean) => {
    const found = later ? undefined : dateError(end, day, endOk);
    setError(found);
    if (found !== undefined) {
      return;
    }
    setBusy(true);
    try {
      const saved = await repos.companies.update(facts.id, { premises: record() });
      await fileUploads(
        repos,
        facts.id,
        files.map((file) => ({
          file,
          type: 'lease' as const,
          title: copy.office.file,
          personId: null,
        })),
        day,
      );
      await finish(facts.id, 'office', officeItems(saved), 'establishment-card');
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : copy.common.error);
      setBusy(false);
    }
  };

  return (
    <Frame
      step="office"
      title={copy.office.title}
      why={copy.office.why}
      onContinue={() => void save(false)}
      onLater={() => void save(true)}
      onBack={() => void navigate(stepPath(facts.id, 'people'))}
      busy={busy}
      snapshot={snapshot}
    >
      <Choice<WithNotSure<OfficeKind>>
        label={copy.office.type}
        why={copy.office.typeWhy}
        value={type}
        options={[
          ...OfficeKind.options.map((value) => ({ value, label: copy.office.types[value] })),
          { value: NOT_SURE, label: copy.common.notSure },
        ]}
        onChange={setType}
      />
      {type !== 'none' ? (
        <>
          <DateEntry
            label={copy.office.end}
            why={copy.office.endWhy}
            value={end}
            onChange={setEnd}
            today={day}
            error={error}
            confirmed={endOk}
            onConfirm={setEndOk}
            testId="lease-end"
          />
          <Choice<WithNotSure<YesNo>>
            label={copy.office.renews}
            why={copy.office.renewsWhy}
            value={renews}
            options={[
              { value: 'yes', label: copy.common.yes },
              { value: 'no', label: copy.common.no },
              { value: NOT_SURE, label: copy.common.notSure },
            ]}
            onChange={setRenews}
          />
        </>
      ) : null}
      {before ? (
        leaseRule.kind === 'confirmed' ? (
          <RuleNote basis={[leaseRule.basis]} tone="warn" testId="lease-warning">
            {copy.office.leaseBeforeConfirmed(zoneLabel)}
          </RuleNote>
        ) : (
          <p className="ob-note ob-note--warn" data-testid="lease-warning">
            {copy.office.leaseBeforeOther}
          </p>
        )
      ) : null}
      {minimum !== null ? (
        <RuleNote basis={[minimum.basis]} testId="business-centre">
          {copy.office.businessCentre(minimum.value, zoneLabel)}
        </RuleNote>
      ) : null}
      <UploadEntry
        label={copy.office.file}
        files={files}
        onAdd={(file) => {
          setFiles([...files, file]);
        }}
      />
    </Frame>
  );
}
