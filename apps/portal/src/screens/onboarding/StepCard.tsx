import {
  establishmentCardCondition,
  establishmentCardRule,
  visaQuotaPrefill,
  visasLeft,
} from '@boasis/rules';
import type { CompanyCardRecord, VisaQuotaRecord } from '@boasis/schema';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { useRepos } from '../../data/ReposProvider';
import type { PickedFile } from '../../lib/files';
import { fieldKeeping, type Entry } from '../../lib/onboarding/fields';
import { cardItems } from '../../lib/onboarding/needs';
import { parseCount } from '../../lib/onboarding/people';
import { companyPeople, snapshotOf, sponsoredCount } from '../../lib/onboarding/snapshot';
import { stepPath } from '../../lib/onboarding/steps';
import { today } from '../../lib/today';
import { DateEntry, dateError, RuleNote, TextEntry, UploadEntry, type DateParts } from './controls';
import { dateEntry, definedOnly, fileUploads, partsOfField } from './form';
import { Frame } from './Frame';
import { useFinishStep, type StepProps } from './Onboarding';
import { zoneName } from './StepLicence';

// Step 5 (section C step 5): the establishment card and the visa quota. The quota is prefilled
// only where the zone confirms a number for the office type; visas used is prefilled with the
// owners and managers this company sponsors.

function countEntry(text: string): Entry<number> {
  if (text.trim() === '') {
    return { kind: 'empty' };
  }
  const value = parseCount(text);
  return value === null ? { kind: 'empty' } : { kind: 'value', value };
}

export function StepCard({ world, facts, authority, zone }: StepProps) {
  const repos = useRepos();
  const finish = useFinishStep();
  const navigate = useNavigate();
  const day = today();
  const people = companyPeople(facts.id, world.people, world.roles);
  const card = facts.companyCards?.find((entry) => entry.kind === 'establishment') ?? null;
  const quota = facts.visaQuota ?? null;
  const officeKind = facts.premises?.type.state === 'known' ? facts.premises.type.value : null;
  const prefill = visaQuotaPrefill(authority, officeKind);
  const [expiry, setExpiry] = useState<DateParts>(partsOfField(card?.expiry));
  const [expiryOk, setExpiryOk] = useState(true);
  const [allowed, setAllowed] = useState(
    quota?.allowed.state === 'known'
      ? String(quota.allowed.value)
      : prefill !== null
        ? String(prefill.value)
        : '',
  );
  const [used, setUsed] = useState(
    quota?.used.state === 'known'
      ? String(quota.used.value)
      : String(sponsoredCount(facts.id, people)),
  );
  const [errors, setErrors] = useState<{ expiry?: string; allowed?: string; used?: string }>({});
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const zoneLabel = zoneName(zone, facts.identity.authority);

  const records = (): { card: CompanyCardRecord; quota: VisaQuotaRecord } => ({
    card: {
      kind: 'establishment',
      expiry: fieldKeeping(dateEntry(expiry), card?.expiry, day),
    },
    quota: {
      allowed: fieldKeeping(countEntry(allowed), quota?.allowed, day),
      used: fieldKeeping(countEntry(used), quota?.used, day),
    },
  });
  const live = records();
  const left = visasLeft(live.quota);
  const condition = establishmentCardCondition(live.card.expiry, day);
  const rule = establishmentCardRule(authority);
  const snapshot = { ...snapshotOf(facts, people), establishmentCard: live.card.expiry };

  const save = async (later: boolean) => {
    const found: typeof errors = {};
    if (!later) {
      found.expiry = dateError(expiry, day, expiryOk);
      if (allowed.trim() !== '' && parseCount(allowed) === null) {
        found.allowed = copy.card.countError;
      }
      if (used.trim() !== '' && parseCount(used) === null) {
        found.used = copy.card.countError;
      }
    }
    const shown = definedOnly(found);
    setErrors(shown);
    if (Object.keys(shown).length > 0) {
      return;
    }
    setBusy(true);
    const next = records();
    const others = (facts.companyCards ?? []).filter((entry) => entry.kind !== 'establishment');
    const allowedValue = next.quota.allowed.state === 'known' ? next.quota.allowed.value : 0;
    const usedValue = next.quota.used.state === 'known' ? next.quota.used.value : 0;
    try {
      const saved = await repos.companies.update(facts.id, {
        companyCards: [...others, next.card],
        visaQuota: next.quota,
        // The older screens read the plain numbers; an unknown count reads as none recorded.
        visaCapacity: { allowed: allowedValue, used: usedValue },
      });
      await fileUploads(
        repos,
        facts.id,
        files.map((file) => ({
          file,
          type: 'establishment-card' as const,
          title: copy.card.file,
          personId: null,
        })),
        day,
      );
      await finish(facts.id, 'establishment-card', cardItems(saved), 'corporate-tax');
    } catch (failure: unknown) {
      setErrors({ expiry: failure instanceof Error ? failure.message : copy.common.error });
      setBusy(false);
    }
  };

  return (
    <Frame
      step="establishment-card"
      title={copy.card.title}
      why={copy.card.why}
      onContinue={() => void save(false)}
      onLater={() => void save(true)}
      onBack={() => void navigate(stepPath(facts.id, 'office'))}
      busy={busy}
      snapshot={snapshot}
    >
      <DateEntry
        label={copy.card.expiry}
        why={copy.card.expiryWhy}
        value={expiry}
        onChange={setExpiry}
        today={day}
        error={errors.expiry}
        confirmed={expiryOk}
        onConfirm={setExpiryOk}
        testId="card-expiry"
      />
      {condition === 'expired' || condition === 'expiring' ? (
        rule.kind === 'confirmed' ? (
          <RuleNote basis={[rule.basis]} tone={condition === 'expired' ? 'late' : 'warn'}>
            {copy.card.expiredConfirmed}
          </RuleNote>
        ) : (
          <p className="ob-note ob-note--warn">{copy.card.otherZones}</p>
        )
      ) : null}
      <TextEntry
        label={copy.card.allowed}
        why={copy.card.allowedWhy}
        value={allowed}
        onChange={setAllowed}
        inputMode="numeric"
        error={errors.allowed}
      />
      {prefill !== null ? (
        <RuleNote basis={[prefill.basis]} testId="quota-prefill">
          {copy.card.prefilled(zoneLabel)}
        </RuleNote>
      ) : null}
      <TextEntry
        label={copy.card.used}
        why={copy.card.usedWhy}
        value={used}
        onChange={setUsed}
        inputMode="numeric"
        error={errors.used}
      />
      {left.kind === 'known' ? (
        <p className="ob-why" role="status" data-testid="visas-left">
          {copy.card.left(left.left)}
        </p>
      ) : null}
      {left.kind === 'known' && left.over ? (
        <p className="ob-note ob-note--warn" role="alert" data-testid="over-quota">
          {copy.card.over}
        </p>
      ) : null}
      <UploadEntry
        label={copy.card.file}
        files={files}
        onAdd={(file) => {
          setFiles([...files, file]);
        }}
      />
    </Frame>
  );
}
