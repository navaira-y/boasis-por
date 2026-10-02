import {
  afterExpiry,
  daysSinceExpiry,
  expiryAfterIssue,
  isAfterToday,
  leaseRequiredToRenew,
  renewalHelp,
  submissionChannel,
  withCompanyProfile,
  zoneRenewalFact,
  zoneShortName,
} from '@boasis/rules';
import {
  LicenceStatus,
  type AuthorityFile,
  type AuthorityId,
  type AuthorityIndexEntry,
  type CompanyFacts,
  type CompanyProfile,
  type Handler,
  type IsoDate,
  type LegalForm,
} from '@boasis/schema';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { onboarding as copy } from '../../copy/en';
import { useOnboardingRefresh, type OnboardingWorld } from '../../data/onboarding';
import { useRepos } from '../../data/ReposProvider';
import { colourSlotOf, firstFreeSlot } from '../../lib/companyColours';
import type { PickedFile } from '../../lib/files';
import { fieldKeeping, type Entry } from '../../lib/onboarding/fields';
import { companyItems } from '../../lib/onboarding/needs';
import { isEmail } from '../../lib/onboarding/people';
import { companyPeople, snapshotOf } from '../../lib/onboarding/snapshot';
import { stepPath } from '../../lib/onboarding/steps';
import { today } from '../../lib/today';
import {
  Choice,
  DateEntry,
  dateError,
  dateValue,
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
import { useFinishStep } from './Onboarding';

// Step 2 (section C step 2): the licence. Before the company exists this step creates it; after,
// it edits the answers. A duplicate (same zone and licence number) is refused without saying who
// holds it. The status branches: expired shows what the zone says happens next; renewal in
// progress asks the expected new expiry; being cancelled flags the company.

const LEGAL_FORMS: readonly Exclude<LegalForm, 'llc' | 'sole-establishment' | 'unknown'>[] = [
  'fze',
  'fzco',
  'free-zone-llc',
  'branch',
  'other',
];

type HandlerKind = Handler['kind'];

export interface StepLicenceProps {
  readonly world: OnboardingWorld;
  readonly facts: CompanyFacts | null;
  readonly authorityId: AuthorityId;
  readonly authority: AuthorityFile | null;
  readonly zone: AuthorityIndexEntry | undefined;
}

interface Errors {
  name?: string;
  number?: string;
  status?: string;
  handler?: string;
  issue?: string;
  expiry?: string;
  expected?: string;
  incorporation?: string;
  agentEmail?: string;
  form?: string;
}

export function zoneName(zone: AuthorityIndexEntry | undefined, fallback: string): string {
  if (zone === undefined) {
    return fallback;
  }
  return zoneShortName(zone.name.value ?? zone.id, zone.aliases);
}

export function StepLicence({ world, facts, authorityId, authority, zone }: StepLicenceProps) {
  const repos = useRepos();
  const finish = useFinishStep();
  const navigate = useNavigate();
  const refresh = useOnboardingRefresh();
  const profile = facts?.profile ?? null;
  const day = today();
  const zoneLabel = zoneName(zone, authorityId);

  const [name, setName] = useState(facts?.identity.tradeName ?? '');
  const [number, setNumber] = useState(facts?.identity.licenceNumber ?? '');
  const [legalForm, setLegalForm] = useState<WithNotSure<LegalForm>>(
    choiceOfField(profile?.legalForm),
  );
  const [status, setStatus] = useState<LicenceStatus | ''>(
    profile?.licenceStatus.state === 'known' ? profile.licenceStatus.value : '',
  );
  const [issue, setIssue] = useState<DateParts>(partsOfField(profile?.licenceIssueDate));
  const [expiry, setExpiry] = useState<DateParts>(partsOfField(profile?.licenceExpiryDate));
  const [expiryConfirmed, setExpiryConfirmed] = useState(false);
  const [expected, setExpected] = useState<DateParts>(partsOfField(profile?.expectedNewExpiry));
  const [expectedConfirmed, setExpectedConfirmed] = useState(false);
  const [term, setTerm] = useState<'1' | '2' | '3'>(() => {
    const years = profile?.licenceTermYears.state === 'known' ? profile.licenceTermYears.value : 1;
    return years >= 3 ? '3' : years === 2 ? '2' : '1';
  });
  const [termYears, setTermYears] = useState(() =>
    profile?.licenceTermYears.state === 'known' && profile.licenceTermYears.value >= 3
      ? String(profile.licenceTermYears.value)
      : '3',
  );
  const [incorporation, setIncorporation] = useState<DateParts>(
    partsOfField(profile?.incorporationDate),
  );
  const [activities, setActivities] = useState(
    profile?.activities?.state === 'known' ? profile.activities.value.join('\n') : '',
  );
  const [website, setWebsite] = useState(
    profile?.website.state === 'known' ? profile.website.value : '',
  );
  const handlerField = profile?.handler ?? null;
  const [handler, setHandler] = useState<WithNotSure<HandlerKind>>(
    handlerField === null
      ? ''
      : handlerField.state === 'known'
        ? handlerField.value.kind
        : handlerField.state === 'unknown'
          ? NOT_SURE
          : '',
  );
  const [agentName, setAgentName] = useState(
    handlerField?.state === 'known' && handlerField.value.kind === 'agent'
      ? (handlerField.value.name ?? '')
      : '',
  );
  const [agentEmail, setAgentEmail] = useState(
    handlerField?.state === 'known' && handlerField.value.kind === 'agent'
      ? (handlerField.value.email ?? '')
      : '',
  );
  const [licenceFiles, setLicenceFiles] = useState<PickedFile[]>([]);
  const [certificateFiles, setCertificateFiles] = useState<PickedFile[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const cameExpired =
    facts !== null &&
    typeof location.state === 'object' &&
    location.state !== null &&
    'expired' in location.state;
  const expiredView = cameExpired
    ? {
        companyId: facts.id,
        expiry:
          facts.profile?.licenceExpiryDate?.state === 'known'
            ? facts.profile.licenceExpiryDate.value
            : null,
      }
    : null;

  const expiryValue = dateValue(expiry);

  // The answers as they stand, for the side panel.
  const statusEntry: Entry<LicenceStatus> =
    status === '' ? { kind: 'empty' } : { kind: 'value', value: status };
  const preview = {
    licenceStatus: fieldKeeping(statusEntry, null, day),
    licenceExpiry: fieldKeeping(dateEntry(expiry), null, day),
    expectedNewExpiry:
      status === 'renewal-in-progress' ? fieldKeeping(dateEntry(expected), null, day) : null,
    incorporationDate: fieldKeeping(dateEntry(incorporation), null, day),
  };
  const base =
    facts === null
      ? { companyId: 'new' }
      : snapshotOf(facts, companyPeople(facts.id, world.people, world.roles));
  const snapshot = { ...base, ...preview };

  const check = (skipRest: boolean): Errors => {
    const found: Errors = {};
    if (name.trim() === '') {
      found.name = copy.licence.companyNameError;
    }
    if (number.trim() === '') {
      found.number = copy.licence.licenceNumberError;
    }
    if (skipRest) {
      return found;
    }
    if (status === '') {
      found.status = copy.licence.statusError;
    }
    if (handler === '') {
      found.handler = copy.licence.handlerError;
    }
    found.issue = dateError(issue, day, true);
    found.expiry = dateError(expiry, day, expiryConfirmed);
    const issueDate = dateValue(issue);
    if (
      found.expiry === undefined &&
      expiryValue !== null &&
      issueDate !== null &&
      !expiryAfterIssue(issueDate, expiryValue)
    ) {
      found.expiry = copy.common.expiryBeforeIssue;
    }
    if (status === 'renewal-in-progress') {
      found.expected = dateError(expected, day, expectedConfirmed);
    }
    found.incorporation = dateError(incorporation, day, true);
    const incorporated = dateValue(incorporation);
    if (
      found.incorporation === undefined &&
      incorporated !== null &&
      isAfterToday(incorporated, day)
    ) {
      found.incorporation = copy.common.notAfterToday;
    }
    if (handler === 'agent' && agentEmail.trim() !== '' && !isEmail(agentEmail)) {
      found.agentEmail = copy.people.emailError;
    }
    return definedOnly(found);
  };

  const save = async (skipRest: boolean) => {
    const found = check(skipRest);
    setErrors(
      skipRest && Object.keys(found).length > 0
        ? { ...found, form: copy.licence.needsIdentity }
        : found,
    );
    if (Object.keys(found).length > 0) {
      return;
    }
    setBusy(true);
    try {
      const licenceNumber = number.trim();
      const changedIdentity =
        facts?.identity.licenceNumber.trim().toLowerCase() !== licenceNumber.toLowerCase();
      if (changedIdentity && (await repos.companies.licenceTaken(authorityId, licenceNumber))) {
        setErrors({ number: copy.licence.duplicate });
        setBusy(false);
        return;
      }
      // A skip keeps every answer given; only what is empty is stored as skipped.
      const later = <T,>(entry: Entry<T>): Entry<T> => entry;
      const handlerEntry: Entry<Handler> =
        handler === 'agent'
          ? {
              kind: 'value',
              value: {
                kind: 'agent',
                name: agentName.trim() === '' ? null : agentName.trim(),
                email: agentEmail.trim() === '' ? null : agentEmail.trim(),
              },
            }
          : handler === 'self' || handler === 'zone'
            ? { kind: 'value', value: { kind: handler } }
            : handler === NOT_SURE
              ? { kind: 'not-sure' }
              : { kind: 'empty' };
      const years = term === '3' ? Math.max(3, Number(termYears) || 3) : Number(term);
      const activityList = activities
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '');
      const nextProfile: CompanyProfile = {
        licenceStatus: fieldKeeping(later(statusEntry), profile?.licenceStatus, day),
        licenceTermYears: fieldKeeping(
          { kind: 'value', value: years },
          profile?.licenceTermYears,
          day,
        ),
        incorporationDate: fieldKeeping(
          later(dateEntry(incorporation)),
          profile?.incorporationDate,
          day,
        ),
        website: fieldKeeping(
          website.trim() === '' ? { kind: 'later' } : { kind: 'value', value: website.trim() },
          profile?.website,
          day,
        ),
        handler: fieldKeeping(later(handlerEntry), profile?.handler, day),
        licenceIssueDate: fieldKeeping(later(dateEntry(issue)), profile?.licenceIssueDate, day),
        licenceExpiryDate: fieldKeeping(later(dateEntry(expiry)), profile?.licenceExpiryDate, day),
        expectedNewExpiry:
          status === 'renewal-in-progress'
            ? fieldKeeping(later(dateEntry(expected)), profile?.expectedNewExpiry, day)
            : null,
        activities: fieldKeeping(
          later(
            activityList.length === 0 ? { kind: 'later' } : { kind: 'value', value: activityList },
          ),
          profile?.activities,
          day,
        ),
        legalForm: fieldKeeping(later(choiceEntry(legalForm)), profile?.legalForm, day),
      };
      const identityLegalForm: LegalForm =
        nextProfile.legalForm?.state === 'known' ? nextProfile.legalForm.value : 'unknown';
      const issueKnown =
        nextProfile.licenceIssueDate?.state === 'known' ? nextProfile.licenceIssueDate.value : null;
      const expiryKnown =
        nextProfile.licenceExpiryDate?.state === 'known'
          ? nextProfile.licenceExpiryDate.value
          : null;
      let current: CompanyFacts;
      if (facts === null) {
        const taken = world.companies.map((company) => colourSlotOf(company));
        // The identity needs dates the person may have skipped. It then holds the day of entry;
        // the profile says the answer was skipped, and the rules read the profile.
        current = await repos.companies.create({
          identity: {
            tradeName: name.trim(),
            legalForm: identityLegalForm,
            authority: authorityId,
            licenceNumber,
            issueDate: issueKnown ?? day,
            expiryDate: expiryKnown ?? day,
            activities: [],
            incorporationDate: day,
            financialYearEnd: '12-31',
          },
          cards: { immigrationCard: null, mohreCard: null },
          tax: {
            corporateTax: { registered: false, registrationNumber: null, registeredOn: null },
            vat: { status: 'unknown', trn: null },
          },
          visaCapacity: { allowed: 0, used: 0 },
          brand: { colourSlot: firstFreeSlot(taken), logoDataUrl: null },
        });
        const start = world.start;
        await repos.accounts.linkCompany({
          accountId: world.account.id,
          companyId: current.id,
          role: start?.role ?? 'owner',
          addedOn: day,
        });
      } else {
        current = facts;
      }
      const written = withCompanyProfile(
        {
          ...current,
          identity: {
            ...current.identity,
            tradeName: name.trim(),
            licenceNumber,
            legalForm: identityLegalForm,
            issueDate: issueKnown ?? current.identity.issueDate,
            expiryDate: expiryKnown ?? current.identity.expiryDate,
          },
        },
        nextProfile,
      );
      const { id, ...patch } = written;
      const saved = await repos.companies.update(id, patch);
      await fileUploads(
        repos,
        saved.id,
        [
          ...licenceFiles.map((file) => ({
            file,
            type: 'licence' as const,
            title: copy.licence.licenceFile,
            personId: null,
          })),
          ...certificateFiles.map((file) => ({
            file,
            type: 'certificate-of-incorporation' as const,
            title: copy.licence.certificateFile,
            personId: null,
          })),
        ],
        day,
      );
      const expired = !skipRest && status === 'expired';
      await finish(saved.id, 'company', companyItems(saved), 'people', false);
      // The expired branch shows what the zone says first; it lives on the company's own step 2,
      // so leaving and coming back does not lose the company.
      void navigate(
        expired ? stepPath(saved.id, 'company') : stepPath(saved.id, 'people'),
        expired ? { state: { expired: true } } : undefined,
      );
      if (facts === null) {
        // Step 1's answers now live on the company; cleared after moving off the pre-company page.
        await repos.onboarding.clearStart(world.account.id);
        await refresh();
      }
    } catch (error: unknown) {
      setErrors({ form: error instanceof Error ? error.message : copy.common.error });
      setBusy(false);
    }
  };

  if (expiredView !== null) {
    return (
      <Expired
        zoneLabel={zoneLabel}
        authority={authority}
        expiry={expiredView.expiry}
        onContinue={() => {
          void navigate(stepPath(expiredView.companyId, 'people'));
        }}
      />
    );
  }

  const legalOptions = [
    ...LEGAL_FORMS.map((value) => ({ value, label: copy.licence.legalForms[value] })),
    { value: NOT_SURE, label: copy.common.notSure },
  ] as const;
  const channel = submissionChannel(authority);

  return (
    <Frame
      step="company"
      title={copy.licence.title}
      onContinue={() => void save(false)}
      onLater={() => void save(true)}
      busy={busy}
      error={errors.form}
      snapshot={snapshot}
    >
      <TextEntry
        label={copy.licence.companyName}
        why={copy.licence.companyNameWhy}
        required
        value={name}
        onChange={setName}
        error={errors.name}
        autoComplete="organization"
      />
      <TextEntry
        label={copy.licence.licenceNumber}
        why={copy.licence.licenceNumberWhy}
        required
        value={number}
        onChange={setNumber}
        error={errors.number}
      />
      <Choice<WithNotSure<LegalForm>>
        label={copy.licence.legalForm}
        why={copy.licence.legalFormWhy}
        value={legalForm}
        options={legalOptions}
        onChange={setLegalForm}
      />
      <Choice<LicenceStatus>
        label={copy.licence.status}
        why={copy.licence.statusWhy}
        required
        value={status}
        error={errors.status}
        options={LicenceStatus.options.map((value) => ({
          value,
          label: copy.licence.statuses[value],
        }))}
        onChange={setStatus}
      />
      {status === 'being-cancelled' ? (
        <p className="ob-note ob-note--info">{copy.licence.beingCancelled}</p>
      ) : null}
      <DateEntry
        label={copy.licence.issueDate}
        why={copy.licence.issueDateWhy}
        value={issue}
        onChange={setIssue}
        today={day}
        error={errors.issue}
        testId="licence-issue"
      />
      <DateEntry
        label={copy.licence.expiryDate}
        why={copy.licence.expiryDateWhy}
        value={expiry}
        onChange={setExpiry}
        today={day}
        error={errors.expiry}
        confirmed={expiryConfirmed}
        onConfirm={setExpiryConfirmed}
        testId="licence-expiry"
      />
      {status === 'renewal-in-progress' ? (
        <DateEntry
          label={copy.licence.expectedNewExpiry}
          why={copy.licence.expectedNewExpiryWhy}
          value={expected}
          onChange={setExpected}
          today={day}
          error={errors.expected}
          confirmed={expectedConfirmed}
          onConfirm={setExpectedConfirmed}
          testId="expected-expiry"
        />
      ) : null}
      <Choice<'1' | '2' | '3'>
        label={copy.licence.term}
        why={copy.licence.termWhy}
        value={term}
        options={[
          { value: '1', label: copy.licence.terms[1] },
          { value: '2', label: copy.licence.terms[2] },
          { value: '3', label: copy.licence.terms[3] },
        ]}
        onChange={setTerm}
      />
      {term === '3' ? (
        <TextEntry
          label={copy.licence.termYears}
          value={termYears}
          onChange={setTermYears}
          inputMode="numeric"
        />
      ) : null}
      <DateEntry
        label={copy.licence.incorporation}
        why={copy.licence.incorporationWhy}
        value={incorporation}
        onChange={setIncorporation}
        today={day}
        error={errors.incorporation}
        testId="incorporation"
      />
      <TextEntry
        label={copy.licence.activities}
        why={copy.licence.activitiesWhy}
        value={activities}
        onChange={setActivities}
        multiline
      />
      <TextEntry
        label={copy.licence.website}
        why={copy.licence.websiteWhy}
        value={website}
        onChange={setWebsite}
        type="url"
        inputMode="url"
      />
      <Choice<WithNotSure<HandlerKind>>
        label={copy.licence.handler}
        why={copy.licence.handlerWhy}
        required
        value={handler}
        error={errors.handler}
        options={[
          { value: 'self', label: copy.licence.handlers.self },
          { value: 'agent', label: copy.licence.handlers.agent },
          { value: 'zone', label: copy.licence.handlers.zone },
          { value: NOT_SURE, label: copy.common.notSure },
        ]}
        onChange={setHandler}
      />
      {handler === 'agent' ? (
        <div className="ob-pair">
          <TextEntry label={copy.licence.agentName} value={agentName} onChange={setAgentName} />
          <TextEntry
            label={copy.licence.agentEmail}
            value={agentEmail}
            onChange={setAgentEmail}
            type="email"
            inputMode="email"
            error={errors.agentEmail}
          />
        </div>
      ) : null}
      {channel !== null ? (
        <RuleNote basis={[channel.basis]} testId="zone-channel">
          <strong>{copy.licence.channel(zoneLabel)}:</strong> {channel.value}
        </RuleNote>
      ) : null}
      <ZoneFacts authority={authority} zoneLabel={zoneLabel} />
      <UploadEntry
        label={copy.licence.licenceFile}
        files={licenceFiles}
        onAdd={(file) => {
          setLicenceFiles([...licenceFiles, file]);
        }}
      />
      <UploadEntry
        label={copy.licence.certificateFile}
        files={certificateFiles}
        onAdd={(file) => {
          setCertificateFiles([...certificateFiles, file]);
        }}
      />
    </Frame>
  );
}

// Section C step 2 and Appendix A: the zone's own renewal facts, each with its source and grade,
// or "unknown" and who can tell you.
function ZoneFacts({
  authority,
  zoneLabel,
}: {
  authority: AuthorityFile | null;
  zoneLabel: string;
}) {
  const lease = leaseRequiredToRenew(authority);
  const together = zoneRenewalFact(authority, 'licence.renewsTogether');
  const after = afterExpiry(authority);
  return (
    <section
      className="ob-facts"
      aria-label={copy.licence.zoneFacts(zoneLabel)}
      data-testid="zone-facts"
    >
      <h2 className="ob-subtitle">{copy.licence.zoneFacts(zoneLabel)}</h2>
      <h3 className="ob-label">{copy.licence.leaseToRenew}</h3>
      {lease.kind === 'confirmed' ? (
        <RuleNote basis={[lease.basis]}>{copy.common.yes}</RuleNote>
      ) : (
        <UnknownRule who={copy.licence.factWho} />
      )}
      <h3 className="ob-label">{copy.licence.renewsTogether}</h3>
      {together !== null ? (
        <RuleNote basis={[together.basis]}>{together.value}</RuleNote>
      ) : (
        <UnknownRule who={copy.licence.factWho} />
      )}
      <h3 className="ob-label">{copy.licence.afterExpiry}</h3>
      {after !== null ? (
        <RuleNote basis={[after.basis]}>{after.value}</RuleNote>
      ) : (
        <UnknownRule who={copy.licence.factWho} />
      )}
    </section>
  );
}

// The expired branch: how long ago, what the zone says happens next, and the way to start
// renewing. Onboarding continues after it.
function Expired({
  zoneLabel,
  authority,
  expiry,
  onContinue,
}: {
  zoneLabel: string;
  authority: AuthorityFile | null;
  expiry: IsoDate | null;
  onContinue: () => void;
}) {
  const [started, setStarted] = useState(false);
  const day = today();
  const after = afterExpiry(authority);
  const help = renewalHelp(authority);
  const since = expiry === null ? null : daysSinceExpiry(expiry, day);
  return (
    <Frame
      step="company"
      title={since !== null && since > 0 ? copy.expired.title(since) : copy.expired.titleUndated}
      onContinue={onContinue}
    >
      <div className="ob-facts" data-testid="licence-expired">
        {after !== null ? (
          <RuleNote basis={[after.basis]} tone="late">
            <strong>{copy.expired.zoneSays(zoneLabel)}:</strong> {after.value}
          </RuleNote>
        ) : (
          <p className="ob-note ob-note--late">{copy.expired.unknown}</p>
        )}
        {started ? (
          <div className="ob-facts">
            <p>{copy.expired.startBody(zoneLabel)}</p>
            <h2 className="ob-subtitle">{copy.expired.checklist}</h2>
            {help.checklist !== null ? (
              <RuleNote basis={[help.checklist.basis]}>
                <ul className="ob-list">
                  {help.checklist.value.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </RuleNote>
            ) : (
              <p className="ob-why">{copy.expired.noChecklist}</p>
            )}
            {help.portal !== null ? (
              <RuleNote basis={[help.portal.basis]}>
                <strong>{copy.expired.contact}:</strong> {help.portal.value}
              </RuleNote>
            ) : null}
          </div>
        ) : (
          <div className="ob__actions">
            <button
              type="button"
              className="ob-btn"
              onClick={() => {
                setStarted(true);
              }}
            >
              {copy.expired.start}
            </button>
          </div>
        )}
      </div>
    </Frame>
  );
}
