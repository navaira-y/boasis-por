import type {
  AuthorityFile,
  Card,
  CompanyFacts,
  Document,
  FederalRules,
  IsoDate,
  Office,
  Person,
} from '@boasis/schema';
import {
  activityChangeOpen,
  auditRequired,
  classifyRequirements,
  type RequirementClassifierLike,
  currentDecision,
  isSponsoredByCompany,
  sectorPermitCodes,
  type Applicability,
  type CompanyContext,
  type RequirementApplicability,
} from './applies';
import { actByDate, addDays, addMonths, isBefore, isOnOrAfter, maxDateOf } from './calendar';
import { licenceRenewalDateOf } from './company-profile';
import { corporateTaxRegistrationOf } from './corporate-tax';
import { decisionNeeded, decisionPoint } from './decision-point';
import { knownValue } from './fields';
import { snapshotDates, type CompanySnapshot } from './onboarding';
import {
  findRequirement,
  requirementByKey,
  type Requirement,
  type RequirementKey,
} from './requirements';
import { vatRegistrationOutcome } from './vat';
import {
  currentMonthEnd,
  currentPayDay,
  currentQuarterEnd,
  currentVatPeriodEnd,
  currentYearEnd,
  nextMonthEnd,
  nextPayDay,
  nextQuarterEnd,
  nextYearEnd,
  stepPeriodEnd,
} from './periods';
import { resolveFact } from './resolve';
import { stateFor } from './states';
import {
  chainStatus,
  passportValidity,
  residencyCompleted,
  residencyDeadline,
  type StageContext,
} from './visa-stages';

// The UBO, corporate tax and VAT day counts are federal rules read from content/federal.json
// (ComputeCardsInput.federal), each with its source and grade.
// Spec 11.2: general assembly within four months of year end (mainland LLC, verify).
export const GENERAL_ASSEMBLY_MONTHS = 4;
// Spec 11.4 and 6.1: 180 consecutive days abroad lapses the residence.
export const ABSENCE_ABROAD_DAYS = 180;

export interface ComputeCardsInput {
  facts: CompanyFacts;
  offices: readonly Office[];
  people: readonly Person[];
  documents: readonly Document[];
  existingCards: readonly Card[];
  authority: AuthorityFile;
  // content/federal.json: the federal day counts (UBO, corporate tax, VAT, passport).
  federal: FederalRules;
  today: IsoDate;
  // Published public holidays as YYYY-MM-DD, for the act-by date (spec 7.1).
  holidays: readonly string[];
  // Which release's requirements to compute (the catalogue's mvp field). Default 1: spec 18.2.
  mvp?: 1 | 2;
  // The Brain seam: who decides which requirements apply. Default: the authority file classifier.
  classifier?: RequirementClassifierLike;
  // Onboarding v2: the company's onboarding answers. When given, the items the onboarding asks
  // about come from them (the same computed dates as step 8), and the older cards those answers
  // resolve are not shown.
  onboarding?: CompanySnapshot | null;
}

// One requirement instance before it becomes a card.
interface Instance {
  requirement: Requirement;
  subjectId: string | null;
  // What makes this instance distinct from the next one: the due date, or the trigger date of
  // an undated requirement. Part of the stable card id.
  cycleKey: string;
  dueOn: IsoDate | null;
  leadDays: number;
  // Proven done by the facts. Spec 5.6: only what is not done becomes a card.
  done?: boolean;
  prerequisiteMissing?: boolean;
  unknown?: boolean;
  decisionNeeded?: boolean;
  pending?: boolean;
  late?: boolean;
}

interface Generator {
  facts: CompanyFacts;
  offices: readonly Office[];
  people: readonly Person[];
  documents: readonly Document[];
  authority: AuthorityFile;
  federal: FederalRules;
  today: IsoDate;
  existing: readonly Card[];
  stages: StageContext;
}

export function cardId(
  requirementId: string,
  subjectId: string | null,
  companyId: string,
  cycleKey: string,
) {
  return `${requirementId}:${subjectId ?? companyId}:${cycleKey}`;
}

function existingComplete(generator: Generator, id: string): boolean {
  return generator.existing.some((card) => card.id === id && card.state === 'complete');
}

function companyDocument(generator: Generator, type: Document['type']): Document | undefined {
  return generator.documents.find(
    (document) => document.personId === null && document.type === type,
  );
}

function personDocument(generator: Generator, person: Person, type: Document['type']) {
  return generator.documents.find(
    (document) => document.personId === person.id && document.type === type,
  );
}

function documentDate(document: Document): IsoDate {
  return document.issueDate ?? document.uploadedOn;
}

// Spec 7.2 Audited accounts: report uploaded before renewal, for the year that ended.
function auditUploadedFor(generator: Generator, periodEnd: IsoDate): boolean {
  return generator.documents.some(
    (document) =>
      document.personId === null &&
      document.type === 'audited-accounts' &&
      isBefore(periodEnd, documentDate(document)),
  );
}

function sponsoredPeople(generator: Generator): Person[] {
  return generator.people.filter(isSponsoredByCompany);
}

function peopleOfType(generator: Generator, ...types: Person['status']['type'][]): Person[] {
  return generator.people.filter((person) => types.includes(person.status.type));
}

// Rolls a period requirement forward while the current cycle's card is already complete (spec 7.3).
function currentCycle(
  generator: Generator,
  requirement: Requirement,
  subjectId: string | null,
  first: IsoDate,
  next: (periodEnd: IsoDate) => IsoDate,
  dueFrom: (periodEnd: IsoDate) => IsoDate,
): { periodEnd: IsoDate; dueOn: IsoDate } {
  let periodEnd = first;
  // Bounded: a card cannot have been closed more than a handful of cycles ahead.
  for (let step = 0; step < 24; step += 1) {
    const dueOn = dueFrom(periodEnd);
    const id = cardId(requirement.id, subjectId, generator.facts.id, dueOn);
    if (!existingComplete(generator, id)) {
      return { periodEnd, dueOn };
    }
    periodEnd = next(periodEnd);
  }
  return { periodEnd, dueOn: dueFrom(periodEnd) };
}

function pending(requirement: Requirement, subjectId: string | null, cycleKey: string): Instance {
  return {
    requirement,
    subjectId,
    cycleKey,
    dueOn: null,
    leadDays: requirement.defaultLeadDays,
    pending: true,
  };
}

function unknown(requirement: Requirement, subjectId: string | null, cycleKey: string): Instance {
  return {
    requirement,
    subjectId,
    cycleKey,
    dueOn: null,
    leadDays: requirement.defaultLeadDays,
    unknown: true,
  };
}

function dated(
  requirement: Requirement,
  subjectId: string | null,
  dueOn: IsoDate,
  extra: Partial<Instance> = {},
): Instance {
  return {
    requirement,
    subjectId,
    cycleKey: dueOn,
    dueOn,
    leadDays: requirement.defaultLeadDays,
    ...extra,
  };
}

// A one-off requirement the facts show is done is not a card at all (spec 5.6).
function done(requirement: Requirement, subjectId: string | null, cycleKey: string): Instance {
  return {
    requirement,
    subjectId,
    cycleKey,
    dueOn: null,
    leadDays: requirement.defaultLeadDays,
    done: true,
  };
}

function chainInstance(generator: Generator, requirement: Requirement, person: Person): Instance[] {
  const status = chainStatus(person, generator.stages);
  if (status.complete) {
    return [];
  }
  const dueOn = status.dueOn;
  return [
    {
      requirement,
      subjectId: person.id,
      cycleKey: dueOn ?? 'open',
      dueOn,
      leadDays: requirement.defaultLeadDays,
      unknown: status.unknown && dueOn === null,
      prerequisiteMissing: status.blocked.length > 0,
      pending: dueOn === null,
    },
  ];
}

// Spec 7.2 Licence: prerequisites for renewal present. The lease minimum and the audit, each
// resolved documents first, then the file, then the owner's answer (build plan 3A).
function licencePrerequisiteMissing(generator: Generator): boolean {
  const { facts, offices } = generator;
  const expiry = facts.identity.expiryDate;
  const leaseMinimum = resolveFact('leaseMinimumRemainingDays', generator).value;
  if (leaseMinimum !== null && offices.length > 0) {
    const needed = addDays(expiry, leaseMinimum);
    if (offices.some((office) => isBefore(office.lease.end, needed))) {
      return true;
    }
  }
  if (auditRequired(generator) === 'yes') {
    const periodEnd = currentYearEnd(
      facts.identity.financialYearEnd,
      generator.today,
      facts.identity.incorporationDate,
    );
    if (isOnOrAfter(generator.today, periodEnd) && !auditUploadedFor(generator, periodEnd)) {
      return true;
    }
  }
  return false;
}

// Spec 6.3 Renew a visa: passport validity, insurance and unemployment insurance dues first.
function visaRenewalPrerequisiteMissing(generator: Generator, person: Person): boolean {
  const passport = passportValidity(
    person,
    generator.authority,
    generator.federal,
    generator.today,
    'renewal',
  );
  if (passport.ok === false) {
    return true;
  }
  if (isSponsoredByCompany(person)) {
    const policy = person.cover.healthInsurance;
    if (policy === null || isBefore(policy.endDate, generator.today)) {
      return true;
    }
  }
  return person.cover.unemploymentInsurance?.duesOutstanding === true;
}

function instancesFor(
  generator: Generator,
  entry: RequirementApplicability,
  applicability: Applicability,
): Instance[] {
  const { requirement } = entry;
  const { facts, offices, people, authority, today } = generator;
  const companyKey = facts.id;
  const flagUnknown = applicability === 'unknown';
  const banks = facts.banks ?? null;

  switch (requirement.key) {
    // 11.1 Day 0
    case 'immigration-card':
      return [
        facts.cards.immigrationCard === null
          ? pending(requirement, null, 'open')
          : done(requirement, null, 'open'),
      ];
    case 'mohre-registration':
      return [
        facts.cards.mohreCard === null
          ? pending(requirement, null, 'open')
          : done(requirement, null, 'open'),
      ];
    case 'zone-portal-registration':
    case 'chamber-membership':
    case 'wps-registration':
      return [
        flagUnknown ? unknown(requirement, null, 'open') : pending(requirement, null, 'open'),
      ];
    case 'office-lease-and-ejari': {
      if (offices.length === 0) {
        return [
          flagUnknown ? unknown(requirement, null, 'open') : pending(requirement, null, 'open'),
        ];
      }
      return offices.map((office) => {
        if (flagUnknown) {
          return unknown(requirement, office.id, 'open');
        }
        return office.lease.ejari === null
          ? pending(requirement, office.id, 'open')
          : done(requirement, office.id, 'open');
      });
    }
    case 'rent-instalment':
      return offices.flatMap((office) =>
        office.lease.paymentSchedule.map((instalment) =>
          dated(requirement, office.id, instalment.dueOn),
        ),
      );
    case 'utilities-and-telecom':
      return offices.map((office) => {
        const services = office.services;
        const set =
          services.electricityAndWaterAccount !== null && services.telecomAccount !== null;
        return set ? done(requirement, office.id, 'open') : pending(requirement, office.id, 'open');
      });
    case 'bank-account':
      if (banks === null) {
        return [unknown(requirement, null, 'open')];
      }
      return [
        banks.length === 0 ? pending(requirement, null, 'open') : done(requirement, null, 'open'),
      ];
    case 'corporate-tax-registration': {
      // Onboarding v2 section I: the onboarding answers when they exist, the company file otherwise.
      const record = facts.tax.corporateTaxRecord ?? null;
      const registered = facts.tax.corporateTax.registered
        ? 'yes'
        : record === null
          ? 'no'
          : knownValue(record.registered);
      const profile = facts.profile ?? null;
      const incorporated =
        profile === null ? facts.identity.incorporationDate : knownValue(profile.incorporationDate);
      const result = corporateTaxRegistrationOf(registered, incorporated, today, generator.federal);
      switch (result.kind) {
        case 'registered':
          return [done(requirement, null, 'open')];
        case 'unknown':
          return [unknown(requirement, null, 'open')];
        case 'register-by':
          return [dated(requirement, null, result.dueOn)];
        case 'late':
          // Incorporated before the timelines began: late, with no date to show.
          return [
            result.dueOn === null
              ? { ...unknown(requirement, null, 'open'), unknown: false, late: true }
              : dated(requirement, null, result.dueOn),
          ];
      }
      break;
    }
    case 'vat-registration':
      return [unknown(requirement, null, 'open')];
    case 'ubo-declaration': {
      const ubo = facts.ubo ?? null;
      if (ubo === null) {
        return [unknown(requirement, null, 'open')];
      }
      if (ubo.declaredOn !== null) {
        return [done(requirement, null, 'open')];
      }
      return [
        dated(
          requirement,
          null,
          addDays(facts.identity.incorporationDate, generator.federal.ubo.declarationDays.value),
        ),
      ];
    }
    case 'company-stamp-and-signatory-letters':
      return [
        companyDocument(generator, 'signatory-letter') === undefined
          ? pending(requirement, null, 'open')
          : done(requirement, null, 'open'),
      ];
    case 'owner-or-partner-visa':
      return peopleOfType(generator, 'partner').flatMap((person) =>
        chainInstance(generator, requirement, person),
      );
    case 'health-insurance-policy':
      return sponsoredPeople(generator).map((person) => {
        if (person.cover.healthInsurance !== null) {
          return done(requirement, person.id, 'open');
        }
        const dueOn = residencyCompleted(person) ? null : residencyDeadline(person, authority);
        return dueOn === null
          ? pending(requirement, person.id, 'open')
          : dated(requirement, person.id, dueOn);
      });
    case 'financial-year-end-chosen':
      // The company file always carries a financial year end (packages/schema).
      return [done(requirement, null, 'open')];
    case 'aml-registration':
      return [
        flagUnknown ? unknown(requirement, null, 'open') : pending(requirement, null, 'open'),
      ];
    case 'sector-permit': {
      const codes = sectorPermitCodes(facts, authority);
      if (codes === null) {
        return [unknown(requirement, null, 'open')];
      }
      return codes.map((code) => pending(requirement, code, 'open'));
    }

    // 11.2 Every year
    case 'decision-point':
    case 'mainland-llc-closing-prompt':
      // Spec 7.1: "decision needed" is the licence card only. Both rows live on it.
      return [];
    case 'licence-renewal': {
      // Onboarding v2 step 2: a skipped or unknown expiry is unknown, never a date.
      const renewsOn = licenceRenewalDateOf(facts);
      if (renewsOn === null) {
        return [unknown(requirement, null, 'open')];
      }
      const point = decisionPoint(facts, authority, today, generator.documents);
      return [
        dated(requirement, null, renewsOn, {
          // Spec 11: each authority file can override the lead time.
          leadDays: authority.licence.renewalLeadDays?.value ?? requirement.defaultLeadDays,
          decisionNeeded: decisionNeeded(point),
          prerequisiteMissing: licencePrerequisiteMissing(generator),
        }),
      ];
    }
    case 'immigration-card-renewal': {
      const card = facts.cards.immigrationCard;
      return card === null ? [] : [dated(requirement, null, card.expiry)];
    }
    case 'mohre-card-renewal': {
      const card = facts.cards.mohreCard;
      return card === null ? [] : [dated(requirement, null, card.expiry)];
    }
    case 'e-signature-card-renewal':
      return generator.documents
        .filter((document) => document.type === 'e-signature-card' && document.expiryDate !== null)
        .map((document) => dated(requirement, document.id, document.expiryDate ?? ''));
    case 'chamber-renewal':
    case 'ubo-confirmation':
      return [dated(requirement, null, facts.identity.expiryDate)];
    case 'office-lease-renewal':
      return offices.map((office) => dated(requirement, office.id, office.lease.end));
    case 'ejari-renewal':
      // The Ejari on file is a fact whatever the flag says; without one the day-0 card asks.
      return offices.flatMap((office) =>
        office.lease.ejari === null
          ? []
          : [dated(requirement, office.id, office.lease.ejari.expiry)],
      );
    case 'audited-accounts': {
      if (flagUnknown) {
        return [unknown(requirement, null, 'open')];
      }
      const periodEnd = currentYearEnd(
        facts.identity.financialYearEnd,
        today,
        facts.identity.incorporationDate,
      );
      if (auditUploadedFor(generator, periodEnd)) {
        return [
          {
            ...dated(requirement, null, facts.identity.expiryDate),
            cycleKey: periodEnd,
            done: true,
          },
        ];
      }
      return [
        {
          ...dated(requirement, null, facts.identity.expiryDate),
          cycleKey: periodEnd,
          // Spec 9A.1: the card turns "action soon" after year end.
          pending: isOnOrAfter(today, periodEnd),
        },
      ];
    }
    case 'corporate-tax-return': {
      const first = currentYearEnd(
        facts.identity.financialYearEnd,
        today,
        facts.identity.incorporationDate,
      );
      const cycle = currentCycle(
        generator,
        requirement,
        null,
        first,
        (end) => nextYearEnd(facts.identity.financialYearEnd, end),
        (end) => addMonths(end, generator.federal.corporateTax.returnMonths.value),
      );
      return [dated(requirement, null, cycle.dueOn)];
    }
    case 'general-assembly': {
      if (flagUnknown) {
        return [unknown(requirement, null, 'open')];
      }
      const first = currentYearEnd(
        facts.identity.financialYearEnd,
        today,
        facts.identity.incorporationDate,
      );
      const cycle = currentCycle(
        generator,
        requirement,
        null,
        first,
        (end) => nextYearEnd(facts.identity.financialYearEnd, end),
        (end) => addMonths(end, GENERAL_ASSEMBLY_MONTHS),
      );
      return [dated(requirement, null, cycle.dueOn)];
    }
    case 'send-licence-to-bank': {
      const issued = facts.identity.issueDate;
      return (banks ?? []).map((bank) =>
        bank.licenceSentOn !== null && isOnOrAfter(bank.licenceSentOn, issued)
          ? done(requirement, bank.id, issued)
          : pending(requirement, bank.id, issued),
      );
    }
    case 'bank-kyc-refresh':
      return (banks ?? []).map((bank) =>
        bank.kycRefreshOn === null
          ? unknown(requirement, bank.id, 'open')
          : dated(requirement, bank.id, bank.kycRefreshOn),
      );
    case 'health-insurance-renewal':
      return sponsoredPeople(generator).flatMap((person) => {
        const policy = person.cover.healthInsurance;
        return policy === null ? [] : [dated(requirement, person.id, policy.endDate)];
      });
    case 'emiratisation':
      // Spec 18.3: needs headcount and sector, neither of which the company file carries yet.
      return [unknown(requirement, null, 'open')];

    // 11.3 Every month or quarter
    case 'wages-pay-date': {
      if (flagUnknown) {
        return [unknown(requirement, null, 'open')];
      }
      const cycle = currentCycle(
        generator,
        requirement,
        null,
        currentPayDay(today),
        nextPayDay,
        (day) => day,
      );
      return [dated(requirement, null, cycle.dueOn)];
    }
    case 'vat-return': {
      const anchor = facts.tax.vat.periodEnd ?? null;
      const months = facts.tax.vat.periodMonths ?? null;
      if (anchor === null || months === null) {
        return [unknown(requirement, null, 'open')];
      }
      const cycle = currentCycle(
        generator,
        requirement,
        null,
        currentVatPeriodEnd(anchor, months, today),
        (end) => stepPeriodEnd(end, months),
        (end) => addDays(end, generator.federal.vat.returnDays.value),
      );
      return [dated(requirement, null, cycle.dueOn)];
    }
    case 'turnover-question': {
      const cycle = currentCycle(
        generator,
        requirement,
        null,
        currentQuarterEnd(today),
        nextQuarterEnd,
        (end) => end,
      );
      return [dated(requirement, null, cycle.dueOn)];
    }
    case 'end-of-service-accrual':
      return peopleOfType(generator, 'employee').map((person) => {
        const cycle = currentCycle(
          generator,
          requirement,
          person.id,
          currentMonthEnd(today),
          nextMonthEnd,
          (end) => end,
        );
        return dated(requirement, person.id, cycle.dueOn);
      });

    // 11.4 People
    case 'visa-stages':
      return peopleOfType(generator, 'employee').flatMap((person) =>
        chainInstance(generator, requirement, person),
      );
    case 'dependant-sponsorship':
      return peopleOfType(generator, 'dependant')
        .filter(isSponsoredByCompany)
        .flatMap((person) => chainInstance(generator, requirement, person));
    case 'labour-contract-registered':
      return peopleOfType(generator, 'employee').flatMap((person) => {
        const entry = person.status.entryDate;
        const registered =
          person.status.contractStart !== null ||
          personDocument(generator, person, 'labour-contract') !== undefined;
        if (entry === null || registered) {
          return [];
        }
        return [dated(requirement, person.id, addDays(entry, 14))];
      });
    case 'residency-completed':
      return people.flatMap((person) => {
        if (person.status.sponsor.kind === 'family' || residencyCompleted(person)) {
          return [];
        }
        const dueOn = residencyDeadline(person, authority);
        return dueOn === null ? [] : [dated(requirement, person.id, dueOn)];
      });
    case 'unemployment-insurance':
      return peopleOfType(generator, 'employee').map((person) => {
        const cover = person.cover.unemploymentInsurance;
        const validUntil = cover?.validUntil ?? null;
        if (validUntil === null) {
          return unknown(requirement, person.id, 'open');
        }
        return dated(requirement, person.id, validUntil, {
          prerequisiteMissing: cover?.duesOutstanding === true,
        });
      });
    case 'residence-visa-renewal':
      return people.flatMap((person) => {
        const expiry = person.status.visaExpiry;
        if (expiry === null) {
          return [];
        }
        return [
          dated(requirement, person.id, expiry, {
            prerequisiteMissing: visaRenewalPrerequisiteMissing(generator, person),
          }),
        ];
      });
    case 'emirates-id-renewal':
      return people.flatMap((person) => {
        const expiry = person.status.emiratesIdExpiry;
        return expiry === null ? [] : [dated(requirement, person.id, expiry)];
      });
    case 'work-permit-renewal':
      return people.flatMap((person) => {
        const expiry = person.status.workPermitExpiry;
        return expiry === null ? [] : [dated(requirement, person.id, expiry)];
      });
    case 'passport-expiry':
      return people.map((person) => {
        const expiry = person.identity.passportExpiry;
        if (expiry === null) {
          return unknown(requirement, person.id, 'open');
        }
        // Spec 6.3: a passport too short for the next visa renewal is a blocker on the visa.
        const visaExpiry = person.status.visaExpiry;
        const required = generator.federal.passport.residenceRenewalMonths.value;
        const blocks = visaExpiry !== null && isBefore(expiry, addMonths(visaExpiry, required));
        return dated(requirement, person.id, expiry, { prerequisiteMissing: blocks });
      });
    case 'probation-end':
      return peopleOfType(generator, 'employee').flatMap((person) => {
        const end = person.status.probationEnd;
        return end === null ? [] : [dated(requirement, person.id, end)];
      });
    case 'absence-abroad':
      return people.flatMap((person) => {
        const exit = person.status.lastExitDate;
        return exit === null
          ? []
          : [dated(requirement, person.id, addDays(exit, ABSENCE_ABROAD_DAYS))];
      });
    case 'leaving':
      return people.flatMap((person) => {
        const end = person.status.contractEnd;
        return end === null ? [] : [dated(requirement, person.id, end)];
      });

    // 11.5 Changes
    case 'ownership-change': {
      const change = facts.ubo?.lastOwnershipChangeOn ?? null;
      return change === null
        ? []
        : [dated(requirement, null, addDays(change, generator.federal.ubo.updateDays.value))];
    }
    case 'activity-change': {
      if (!activityChangeOpen(facts)) {
        return [];
      }
      const dates = facts.identity.activities.flatMap((activity) => [
        activity.addedOn,
        ...(activity.removedOn === null ? [] : [activity.removedOn]),
      ]);
      return [pending(requirement, null, maxDateOf(dates) ?? 'open')];
    }
    case 'manager-or-signatory-change':
    case 'office-move':
    case 'quota-increase':
      // Opened by the app on the event; kept and judged from the existing cards below.
      return [];

    // 11.6 Exit
    case 'resolution-and-liquidator':
    case 'clearances':
    case 'cancellation-certificate':
    case 'vat-deregistration':
    case 'corporate-tax-deregistration':
      return [pending(requirement, null, exitKey(facts) ?? companyKey)];
    case 'cancel-employee-visas':
      return peopleOfType(generator, 'employee').map((person) =>
        pending(requirement, person.id, exitKey(facts) ?? companyKey),
      );
    case 'cancel-partner-visas-and-cards':
      return peopleOfType(generator, 'partner').map((person) =>
        pending(requirement, person.id, exitKey(facts) ?? companyKey),
      );
    case 'hand-back-office':
      return offices.map((office) => pending(requirement, office.id, exitKey(facts) ?? companyKey));
    case 'close-bank-account':
      return (banks ?? []).map((bank) =>
        pending(requirement, bank.id, exitKey(facts) ?? companyKey),
      );
  }
}

function exitKey(facts: CompanyFacts): string | null {
  return currentDecision(facts)?.forExpiry ?? null;
}

function toCard(
  generator: Generator,
  instance: Instance,
  holidays: readonly string[],
): Card | null {
  const { requirement, subjectId } = instance;
  const companyId = generator.facts.id;
  const id = cardId(requirement.id, subjectId, companyId, instance.cycleKey);
  const exact = generator.existing.find((card) => card.id === id);
  // A corrected date changes the id (spec 7.3); the open card for the same subject carries on.
  const sameSubject =
    exact ??
    generator.existing.find(
      (card) =>
        card.requirementId === requirement.id &&
        (card.subjectId ?? null) === subjectId &&
        card.state !== 'complete',
    );
  const complete = exact?.state === 'complete';
  if (instance.done === true && !complete) {
    return null;
  }
  const state = stateFor({
    dueOn: instance.dueOn,
    today: generator.today,
    leadDays: instance.leadDays,
    complete,
    prerequisiteMissing: instance.prerequisiteMissing,
    unknown: instance.unknown,
    decisionNeeded: instance.decisionNeeded,
    pending: instance.pending,
    late: instance.late,
  });
  return {
    id,
    companyId,
    requirementId: requirement.id,
    area: requirement.area,
    state,
    dueOn: instance.dueOn,
    actBy: instance.dueOn === null ? null : actByDate(instance.dueOn, holidays),
    subjectId,
    responsibleId: sameSubject?.responsibleId ?? null,
    steps: sameSubject?.steps ?? [],
    evidence: sameSubject?.evidence ?? [],
  };
}

// Existing cards for event-opened requirements (spec 11.5, 11.6): the engine cannot derive them
// from the facts, so it keeps them and judges their date.
function keptEventCards(
  generator: Generator,
  computed: ReadonlySet<string>,
  holidays: readonly string[],
  mvp: 1 | 2,
): Card[] {
  return generator.existing.flatMap((card) => {
    const requirement = findRequirement(card.requirementId);
    if (requirement?.triggerKind !== 'event' || requirement.mvp > mvp || computed.has(card.id)) {
      return [];
    }
    return [
      {
        ...card,
        state: stateFor({
          dueOn: card.dueOn,
          today: generator.today,
          leadDays: requirement.defaultLeadDays,
          complete: card.state === 'complete',
          pending: card.dueOn === null,
        }),
        actBy: card.dueOn === null ? null : actByDate(card.dueOn, holidays),
        subjectId: card.subjectId ?? null,
      },
    ];
  });
}

// Spec 7: one card per requirement that applies to this company; requirements that do not apply are
// not shown. Deterministic: the same inputs give the same cards in the same order, with stable ids.
export function computeCards(input: ComputeCardsInput): Card[] {
  const mvp = input.mvp ?? 1;
  const context: CompanyContext = {
    facts: input.facts,
    offices: input.offices,
    people: input.people,
    authority: input.authority,
    documents: input.documents,
  };
  const generator: Generator = {
    ...context,
    documents: input.documents,
    today: input.today,
    federal: input.federal,
    existing: input.existingCards,
    stages: { authority: input.authority, documents: input.documents, today: input.today },
  };
  const cards: Card[] = [];
  const decided =
    input.classifier === undefined
      ? classifyRequirements(context)
      : input.classifier
          .classify(
            {
              facts: input.facts,
              offices: input.offices,
              people: input.people,
              documents: input.documents,
            },
            input.authority,
          )
          .flatMap((decision): RequirementApplicability[] => {
            const requirement = findRequirement(decision.requirementId);
            return requirement === null
              ? []
              : [{ requirement, applicability: decision.applicability }];
          });
  for (const entry of decided) {
    if (entry.applicability === 'no' || entry.requirement.mvp > mvp) {
      continue;
    }
    for (const instance of instancesFor(generator, entry, entry.applicability)) {
      const card = toCard(generator, instance, input.holidays);
      if (card !== null) {
        cards.push(card);
      }
    }
  }
  const computed = new Set(cards.map((card) => card.id));
  cards.push(...keptEventCards(generator, computed, input.holidays, mvp));
  const all =
    input.onboarding == null
      ? cards
      : [
          ...cards.filter(
            (card) => !ONBOARDING_RESOLVES.includes(findRequirement(card.requirementId)?.key ?? ''),
          ),
          ...onboardingInstances(generator, input.onboarding).flatMap((instance) => {
            const card = toCard(generator, instance, input.holidays);
            return card === null ? [] : [card];
          }),
        ];
  return all.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Onboarding v2: the requirements the onboarding answers decide. For a company with answers these
// come only from onboardingInstances, never from the older facts.
export const ONBOARDING_RESOLVES: readonly string[] = [
  'immigration-card',
  'immigration-card-renewal',
  'office-lease-and-ejari',
  'office-lease-renewal',
  'corporate-tax-registration',
  'corporate-tax-return',
  'financial-year-end-chosen',
  'vat-registration',
  'vat-return',
  'turnover-question',
  'residence-visa-renewal',
  'emirates-id-renewal',
  'passport-expiry',
];

// The cards of an onboarded company, from the same computed dates as the onboarding's year
// (snapshotDates). An unanswered item is unknown; an answered one never reads late for a question.
function onboardingInstances(generator: Generator, snapshot: CompanySnapshot): Instance[] {
  const { today, federal } = generator;
  const by = (key: RequirementKey) => requirementByKey(key);
  const dates = snapshotDates(snapshot, federal, today);
  const item = (kind: string, personId: string | null = null) =>
    dates.dated.find((entry) => entry.kind === kind && entry.personId === personId);
  const instances: Instance[] = [];

  const card = snapshot.establishmentCard ?? null;
  if (card !== null) {
    const due = knownValue(card);
    instances.push(
      due === null
        ? unknown(by('immigration-card-renewal'), null, 'open')
        : dated(by('immigration-card-renewal'), null, due),
    );
  }

  const premises = snapshot.premises ?? null;
  if (premises !== null && knownValue(premises.type) !== 'none') {
    const end = knownValue(premises.endDate);
    instances.push(
      end === null
        ? unknown(by('office-lease-renewal'), null, 'open')
        : dated(by('office-lease-renewal'), null, end),
    );
  }

  for (const person of snapshot.people ?? []) {
    const passport = knownValue(person.passportExpiry);
    const visa = knownValue(person.visaExpiry);
    if (passport === null) {
      instances.push(unknown(by('passport-expiry'), person.id, 'open'));
    } else {
      const required = federal.passport.residenceRenewalMonths.value;
      instances.push(
        dated(by('passport-expiry'), person.id, passport, {
          prerequisiteMissing: visa !== null && isBefore(passport, addMonths(visa, required)),
        }),
      );
    }
    if (person.sponsoredHere === true) {
      if (visa !== null) {
        instances.push(dated(by('residence-visa-renewal'), person.id, visa));
      }
      const emiratesId = knownValue(person.emiratesIdExpiry);
      if (emiratesId !== null) {
        instances.push(dated(by('emirates-id-renewal'), person.id, emiratesId));
      }
    }
  }

  const tax = snapshot.corporateTax ?? null;
  const registered = knownValue(tax?.registered);
  if (registered === null) {
    instances.push(unknown(by('corporate-tax-registration'), null, 'open'));
  } else if (registered === 'no') {
    const registration = item('corporate-tax-registration');
    // The only undated late item is the corporate tax registration.
    const undated = dates.late.length > 0;
    if (registration !== undefined) {
      instances.push(dated(by('corporate-tax-registration'), null, registration.dueOn));
    } else if (undated) {
      instances.push({
        ...unknown(by('corporate-tax-registration'), null, 'open'),
        unknown: false,
        late: true,
      });
    } else {
      instances.push(unknown(by('corporate-tax-registration'), null, 'open'));
    }
  }
  if (registered !== null) {
    const taxReturn = item('corporate-tax-return');
    instances.push(
      taxReturn === undefined
        ? unknown(by('corporate-tax-return'), null, 'open')
        : dated(by('corporate-tax-return'), null, taxReturn.dueOn),
    );
  }

  const vat = snapshot.vat ?? null;
  const vatRegistered = knownValue(vat?.registered);
  if (vatRegistered === 'yes') {
    const vatReturn = item('vat-return');
    instances.push(
      vatReturn === undefined
        ? unknown(by('vat-return'), null, 'open')
        : dated(by('vat-return'), null, vatReturn.dueOn),
    );
  } else if (vatRegistered === 'no' && vat !== null) {
    const { outcome } = vatRegistrationOutcome(vat, federal);
    if (outcome === 'mandatory') {
      instances.push(pending(by('vat-registration'), null, 'open'));
    } else if (outcome === 'unknown') {
      instances.push(unknown(by('vat-registration'), null, 'open'));
    }
  } else {
    instances.push(unknown(by('vat-registration'), null, 'open'));
  }
  return instances;
}
