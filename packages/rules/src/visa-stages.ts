import {
  Stage,
  type AuthorityFile,
  type Document,
  type FederalRules,
  type IsoDate,
  type Person,
} from '@boasis/schema';
import { addDays, addMonths, isBefore, isOnOrAfter, minDate } from './calendar';

// Spec 6.2: a visa is a chain of ten stages, each with a typical time and an expiry of its own.
// The person doing the submission logs each step; the portal cannot see live government status.

export interface StageContext {
  authority: AuthorityFile;
  documents: readonly Document[];
  today: IsoDate;
}

export interface StageValidity {
  // The day this stage's own clock runs out; null when the stage has none or is not reached.
  dueOn: IsoDate | null;
  // True when the authority file lacks the value the clock needs (spec 11A).
  unknown: boolean;
  // True when something this stage needs is missing or lapsed (a prerequisite, spec 7.1). In a
  // stage chain only the stage next in the chain can be blocked (see stageChain).
  blocked: boolean;
  note: string;
}

export interface StageRule {
  stage: Stage;
  title: string;
  spec: string;
  // Whether the stage exists for this person under this authority.
  appliesTo(person: Person, authority: AuthorityFile): boolean;
  validity(person: Person, context: StageContext): StageValidity;
}

export interface StageCheck extends StageValidity {
  stage: Stage;
  title: string;
  applies: boolean;
  position: 'done' | 'current' | 'pending';
}

// Spec 6.2 stage 4 and 11.4: residency within 60 days of entry (Dubai confirmed; SRTIP 55).
export const DEFAULT_ENTRY_TO_RESIDENCY_DAYS = 60;
// Spec 6.2 stage 6 and 11.4: the medical certificate is valid three months.
export const MEDICAL_VALIDITY_MONTHS = 3;
// Spec 11.4: labour contract registered within 14 days of entry (mainland, reported).
export const LABOUR_CONTRACT_DAYS = 14;

export const STAGE_ORDER: readonly Stage[] = Stage.options;

export function stageIndex(stage: Stage): number {
  return STAGE_ORDER.indexOf(stage);
}

function isMainland(authority: AuthorityFile): boolean {
  return authority.identity.type.value === 'mainland';
}

function none(note: string): StageValidity {
  return { dueOn: null, unknown: false, blocked: false, note };
}

function personDocument(person: Person, documents: readonly Document[], type: Document['type']) {
  return documents.find((document) => document.personId === person.id && document.type === type);
}

export function residencyDeadline(person: Person, authority: AuthorityFile): IsoDate | null {
  const entry = person.status.entryDate;
  if (entry === null) {
    return null;
  }
  const days = authority.people.entryToResidencyDays?.value ?? DEFAULT_ENTRY_TO_RESIDENCY_DAYS;
  return addDays(entry, days);
}

export function residencyCompleted(person: Person): boolean {
  return person.status.visaExpiry !== null;
}

// Spec 6.1: a person on a spouse's visa needs a work permit only, not the visa chain.
function onFamilyVisa(person: Person): boolean {
  return person.status.sponsor.kind === 'family';
}

// Spec 6.2 stage 9 and 10: the labour contract and the work permit belong to employment. A
// partner or a dependant ends the chain at the residence visa.
function employmentStage(person: Person): boolean {
  return person.status.type === 'employee';
}

export const visaStages: readonly StageRule[] = [
  {
    stage: 'quota-check',
    title: 'Quota check',
    spec: '6.2 stage 1',
    appliesTo: (person) => !onFamilyVisa(person),
    validity: () => none('A visa slot exists under the company.'),
  },
  {
    stage: 'offer-letter',
    title: 'Offer letter and labour approval',
    spec: '6.2 stage 2',
    appliesTo: (person) => employmentStage(person),
    validity: () => none('Mainland: MOHRE; free zone: the zone.'),
  },
  {
    stage: 'entry-permit',
    title: 'Entry permit issued',
    spec: '6.2 stage 3',
    appliesTo: (person) => !onFamilyVisa(person),
    validity: (person, { authority }) => {
      const issued = person.status.entryPermitIssuedOn;
      if (issued === null || person.status.entryDate !== null) {
        return none('Lapses if unused.');
      }
      const months = authority.people.permitValidityMonths?.value ?? undefined;
      if (months === undefined) {
        return { dueOn: null, unknown: true, blocked: false, note: 'Permit validity per file.' };
      }
      return {
        dueOn: addMonths(issued, months),
        unknown: false,
        blocked: false,
        note: 'Lapses if unused.',
      };
    },
  },
  {
    stage: 'entry',
    title: 'Entry into the country or status change',
    spec: '6.2 stage 4',
    appliesTo: (person) => !onFamilyVisa(person),
    validity: (person, { authority }) => {
      if (residencyCompleted(person)) {
        return none('Residency completed.');
      }
      return {
        dueOn: residencyDeadline(person, authority),
        unknown: false,
        blocked: false,
        note: 'Residency must be completed within the authority’s days from entry.',
      };
    },
  },
  {
    stage: 'health-insurance',
    title: 'Health insurance in force',
    spec: '6.2 stage 5',
    appliesTo: (person) => !onFamilyVisa(person),
    validity: (person, { authority, today }) => {
      const policy = person.cover.healthInsurance;
      const inForce = policy !== null && isOnOrAfter(policy.endDate, today);
      return {
        dueOn: residencyCompleted(person) ? null : residencyDeadline(person, authority),
        unknown: false,
        blocked: !inForce,
        note: 'The policy must exist before the residency application.',
      };
    },
  },
  {
    stage: 'medical',
    title: 'Medical fitness test',
    spec: '6.2 stage 6',
    appliesTo: (person) => !onFamilyVisa(person),
    validity: (person, { documents }) => {
      const result = personDocument(person, documents, 'medical-result');
      if (
        result?.issueDate === undefined ||
        result.issueDate === null ||
        residencyCompleted(person)
      ) {
        return none('The certificate is valid for three months.');
      }
      return {
        dueOn: addMonths(result.issueDate, MEDICAL_VALIDITY_MONTHS),
        unknown: false,
        blocked: false,
        note: 'The certificate is valid for three months.',
      };
    },
  },
  {
    stage: 'emirates-id',
    title: 'Emirates ID application and biometrics',
    spec: '6.2 stage 7',
    appliesTo: (person) => !onFamilyVisa(person),
    validity: () => none('Within the residency clock.'),
  },
  {
    stage: 'residence-visa',
    title: 'Residence visa stamped or issued',
    spec: '6.2 stage 8',
    appliesTo: (person) => !onFamilyVisa(person),
    validity: () => none('Within the residency clock.'),
  },
  {
    stage: 'labour-contract',
    title: 'Labour contract registered or zone contract signed',
    spec: '6.2 stage 9, 11.4',
    appliesTo: (person) => employmentStage(person),
    validity: (person, { authority, documents }) => {
      const registered =
        person.status.contractStart !== null ||
        personDocument(person, documents, 'labour-contract') !== undefined;
      const entry = person.status.entryDate;
      if (!isMainland(authority) || registered || entry === null) {
        return none('Mainland: registered with MOHRE; free zone: signed with the zone.');
      }
      return {
        dueOn: addDays(entry, LABOUR_CONTRACT_DAYS),
        unknown: false,
        blocked: false,
        note: 'Mainland: within 14 days of entry or status change (reported).',
      };
    },
  },
  {
    stage: 'work-permit',
    title: 'Unemployment insurance certificate, then the work permit or labour card',
    spec: '6.2 stage 10, 6.1',
    appliesTo: (person, authority) => employmentStage(person) && isMainland(authority),
    validity: (person) => {
      const cover = person.cover.unemploymentInsurance;
      const blocked = cover === null || cover.duesOutstanding === true;
      return {
        dueOn: null,
        unknown: false,
        blocked,
        note: 'The certificate is needed before the labour card; dues block permits (reported).',
      };
    },
  },
];

export function stageRule(stage: Stage): StageRule {
  const rule = visaStages.find((entry) => entry.stage === stage);
  if (rule === undefined) {
    throw new Error(`no stage ${stage}`);
  }
  return rule;
}

// The last stage this person's chain runs to.
export function lastStage(person: Person, authority: AuthorityFile): Stage {
  const applicable = visaStages.filter((rule) => rule.appliesTo(person, authority));
  const last = applicable[applicable.length - 1];
  return last === undefined ? 'residence-visa' : last.stage;
}

// The paper that completes a stage when it is filed against the person (spec 6.2, 5.3).
export const STAGE_DOCUMENT: Readonly<Partial<Record<Stage, Document['type']>>> = {
  'offer-letter': 'offer-letter',
  'entry-permit': 'entry-permit',
  medical: 'medical-result',
  'emirates-id': 'emirates-id',
  'residence-visa': 'visa',
  'labour-contract': 'labour-contract',
  'work-permit': 'work-permit',
};

// A stage the person's own record shows is done, whatever stage was last logged: a document of
// the stage's type filed against the person (filing it is the human confirmation, spec 5.1), or
// a registered labour contract.
function stageRecorded(stage: Stage, person: Person, context: StageContext): boolean {
  const type = STAGE_DOCUMENT[stage];
  if (type !== undefined && personDocument(person, context.documents, type) !== undefined) {
    return true;
  }
  return stage === 'labour-contract' && person.status.contractStart !== null;
}

// Every stage with where the person stands and what its own clock says. A missing prerequisite
// blocks only the stage next in the chain: the stage in progress, or the first applicable stage
// still to do after it. A stage further ahead cannot proceed yet anyway, so it is not blocked.
export function stageChain(person: Person, context: StageContext): StageCheck[] {
  const current = stageIndex(person.status.stage);
  const checks: StageCheck[] = visaStages.map((rule) => {
    const index = stageIndex(rule.stage);
    const position =
      index < current || stageRecorded(rule.stage, person, context)
        ? 'done'
        : index === current
          ? 'current'
          : 'pending';
    return {
      stage: rule.stage,
      title: rule.title,
      applies: rule.appliesTo(person, context.authority),
      position,
      ...rule.validity(person, context),
    };
  });
  const next = checks.find((check) => check.applies && check.position === 'pending')?.stage;
  return checks.map((check) => ({
    ...check,
    blocked: check.blocked && (check.position === 'current' || check.stage === next),
  }));
}

export interface ChainStatus {
  complete: boolean;
  // The earliest open clock across the stages not yet done.
  dueOn: IsoDate | null;
  unknown: boolean;
  blocked: Stage[];
}

// Spec 6.2: the chain is complete when the last stage for this person has its own record: on
// the mainland the work permit, in a zone the stamped visa with the contract signed, and for a
// partner or a dependant the stamped visa. The recorded stage positions the person; the dates
// decide.
export function chainComplete(person: Person, context: StageContext): boolean {
  const last = lastStage(person, context.authority);
  if (last === 'work-permit') {
    return person.status.workPermitExpiry !== null;
  }
  if (last === 'labour-contract') {
    const signed =
      person.status.contractStart !== null ||
      personDocument(person, context.documents, 'labour-contract') !== undefined;
    return residencyCompleted(person) && signed;
  }
  return residencyCompleted(person);
}

export function chainStatus(person: Person, context: StageContext): ChainStatus {
  const complete = chainComplete(person, context);
  // A stage the person has passed still counts while its clock runs or its prerequisite is
  // missing: the residency clock outlives the entry stage, a lapsed policy blocks later stages.
  const open = stageChain(person, context).filter(
    (check) =>
      check.applies && (check.position !== 'done' || check.dueOn !== null || check.blocked),
  );
  return {
    complete,
    dueOn: complete
      ? null
      : minDate(open.flatMap((check) => (check.dueOn === null ? [] : [check.dueOn]))),
    unknown: !complete && open.some((check) => check.unknown),
    blocked: complete ? [] : open.filter((check) => check.blocked).map((check) => check.stage),
  };
}

export type VisaPurpose = 'new' | 'renewal';

export interface PassportValidity {
  // Null when the authority file lacks the new-visa rule or the passport expiry is not recorded.
  ok: boolean | null;
  requiredMonths: number | null;
  requiredUntil: IsoDate | null;
}

// Spec 6.3 and 11.4: passport validity for a new visa per authority file (SRTIP eight months),
// and at renewal per the federal rule (ICP: six months, content/federal.json), the same under every
// authority (onboarding v2 section I).
export function passportValidity(
  person: Person,
  authority: AuthorityFile,
  federal: FederalRules,
  today: IsoDate,
  purpose: VisaPurpose,
): PassportValidity {
  const requiredMonths =
    purpose === 'new'
      ? (authority.people.passportValidityNewMonths?.value ?? undefined)
      : federal.passport.residenceRenewalMonths.value;
  const expiry = person.identity.passportExpiry;
  if (requiredMonths === undefined || expiry === null) {
    return { ok: null, requiredMonths: requiredMonths ?? null, requiredUntil: null };
  }
  const requiredUntil = addMonths(today, requiredMonths);
  return { ok: !isBefore(expiry, requiredUntil), requiredMonths, requiredUntil };
}
