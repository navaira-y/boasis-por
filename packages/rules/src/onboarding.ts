import type {
  CorporateTaxRecord,
  FederalRules,
  Field,
  IsoDate,
  LicenceStatus,
  PremisesRecord,
  VatRecord,
  VisaQuotaRecord,
} from '@boasis/schema';
import { addDays, addMonths, compareDates, daysUntil, isBefore } from './calendar';
import { corporateTaxRegistration, firstTaxPeriod, nextCorporateTaxReturn } from './corporate-tax';
import { basisOf, knownValue, type RuleBasis } from './fields';
import { passportAlerts } from './passport';
import { REMINDER_LADDER } from './reminders';
import { requirementByKey } from './requirements';
import { nextVatReturn } from './vat';

// Onboarding v2 sections B.7, C and E: the dates the onboarding shows while the person answers,
// and the year it ends on. Every date is computed here from the answers and content; nothing is
// stored. The reminder schedules are Boasis schedules (section E), the same for every zone.

// Section E.
export const LICENCE_REMINDER_DAYS: readonly number[] = REMINDER_LADDER;
export const LEASE_REMINDER_DAYS: readonly number[] = [90, 60, 30];
export const CARD_REMINDER_DAYS: readonly number[] = REMINDER_LADDER;
export const VISA_REMINDER_DAYS: readonly number[] = REMINDER_LADDER;
export const CT_REGISTRATION_REMINDER_DAYS: readonly number[] = [30, 14, 7, 1];
export const CT_RETURN_REMINDER_DAYS: readonly number[] = [90, 30, 7];
export const VAT_RETURN_REMINDER_DAYS: readonly number[] = [14, 7, 1];

// Section B.7: a date more than this many years out asks "Is this right?".
export const FAR_FUTURE_YEARS = 10;

// ---------------------------------------------------------------------------------------------
// Date checks (section B.7)

// The expiry must come after the issue date.
export function expiryAfterIssue(issue: IsoDate, expiry: IsoDate): boolean {
  return isBefore(issue, expiry);
}

export function isFarFuture(date: IsoDate, today: IsoDate): boolean {
  return isBefore(addMonths(today, FAR_FUTURE_YEARS * 12), date);
}

export function isAfterToday(date: IsoDate, today: IsoDate): boolean {
  return isBefore(today, date);
}

// ---------------------------------------------------------------------------------------------
// Small computations the steps show

// The days a reminder fires for a due date, from today on, earliest first.
export function reminderDates(
  dueOn: IsoDate,
  offsets: readonly number[],
  today: IsoDate,
): IsoDate[] {
  return offsets
    .map((offset) => addDays(dueOn, -offset))
    .filter((fireOn) => !isBefore(fireOn, today))
    .sort(compareDates);
}

// Step 2: the date the licence renews on. While a renewal is in progress and the expected new
// expiry is known, reminders start from that date.
export function licenceRenewalDate(
  status: Field<LicenceStatus> | null | undefined,
  expiry: Field<IsoDate> | null | undefined,
  expectedNewExpiry: Field<IsoDate> | null | undefined,
): IsoDate | null {
  const expected = knownValue(expectedNewExpiry);
  if (knownValue(status) === 'renewal-in-progress' && expected !== null) {
    return expected;
  }
  return knownValue(expiry);
}

// Step 2: the "Renew, cancel or change?" decision opens this many days before expiry.
export function decisionPointDate(expiry: IsoDate): IsoDate {
  return addDays(expiry, -requirementByKey('decision-point').defaultLeadDays);
}

// Step 2, expired branch: whole days since the licence expired; 0 or less when it has not.
export function daysSinceExpiry(expiry: IsoDate, today: IsoDate): number {
  return -daysUntil(expiry, today);
}

// Step 4: the lease ends before the licence.
export function leaseEndsBeforeLicence(
  leaseEnd: Field<IsoDate> | null | undefined,
  licenceExpiry: IsoDate | null,
): boolean {
  const end = knownValue(leaseEnd);
  return end !== null && licenceExpiry !== null && isBefore(end, licenceExpiry);
}

// Step 4: under the zone's minimum, the lease needs renewing now.
export function leaseUnderMinimum(
  leaseEnd: Field<IsoDate> | null | undefined,
  minimumDays: number,
  today: IsoDate,
): boolean {
  const end = knownValue(leaseEnd);
  return end !== null && daysUntil(end, today) < minimumDays;
}

// Step 5: the establishment card is expired, or inside the reminder window.
export type CardCondition = 'expired' | 'expiring' | 'valid' | 'unknown';

export function establishmentCardCondition(
  expiry: Field<IsoDate> | null | undefined,
  today: IsoDate,
): CardCondition {
  const known = knownValue(expiry);
  if (known === null) {
    return 'unknown';
  }
  const left = daysUntil(known, today);
  if (left < 0) {
    return 'expired';
  }
  return left <= (CARD_REMINDER_DAYS[0] ?? 0) ? 'expiring' : 'valid';
}

// Step 5: visas left = allowed minus used, and whether the records pass the quota.
export type VisasLeft = { kind: 'known'; left: number; over: boolean } | { kind: 'unknown' };

export function visasLeft(quota: VisaQuotaRecord | null | undefined): VisasLeft {
  const allowed = knownValue(quota?.allowed);
  const used = knownValue(quota?.used);
  if (allowed === null || used === null) {
    return { kind: 'unknown' };
  }
  return { kind: 'known', left: Math.max(allowed - used, 0), over: used > allowed };
}

// ---------------------------------------------------------------------------------------------
// The dated items: "Your dates so far" (section B.4) and "Your year" (step 8)

export type DatedKind =
  | 'licence-renewal'
  | 'decision-point'
  | 'lease-end'
  | 'establishment-card'
  | 'passport-early-warning'
  | 'passport-alert'
  | 'visa-expiry'
  | 'emirates-id-expiry'
  | 'corporate-tax-registration'
  | 'corporate-tax-return'
  | 'vat-return';

// Step 8 "Next 3": a deadline this close counts as urgent, ahead of the "now" markers.
export const DUE_SOON_DAYS = 14;

// Reminder and warning markers: the day to act, not a legal deadline. Once passed they read
// "now" (action needed), never "late". Every other kind is a deadline or an expiry.
export const MARKER_KINDS: readonly DatedKind[] = [
  'decision-point',
  'passport-early-warning',
  'passport-alert',
];

// Items about a person's own papers, shown once across companies.
export const PERSONAL_KINDS: readonly DatedKind[] = [
  'passport-early-warning',
  'passport-alert',
  'visa-expiry',
  'emirates-id-expiry',
];

export interface DatedItem {
  // Stable across renders and, for a person's papers, across companies, so a combined year shows
  // each once.
  id: string;
  kind: DatedKind;
  // The company the item belongs to; for a person's papers, the first company they were read from.
  companyId: string;
  // The person the item is about, for a person's papers.
  personId: string | null;
  personName: string | null;
  dueOn: IsoDate;
  // The reminder days still ahead, earliest first.
  reminders: IsoDate[];
  // The rules the date rests on. Empty when the date is the person's own answer (an expiry they
  // typed), which is its own source.
  basis: RuleBasis[];
  // A first corporate tax return (from the first tax period end).
  first?: boolean;
  // The first tax period end was calculated from the rule, not entered (step 6, not registered).
  calculated?: boolean;
}

export type ItemStatus = 'late' | 'now' | 'upcoming';

// A deadline whose day has passed is late; a marker whose day has come is "now".
export function itemStatus(item: Pick<DatedItem, 'kind' | 'dueOn'>, today: IsoDate): ItemStatus {
  if (MARKER_KINDS.includes(item.kind)) {
    return isBefore(today, item.dueOn) ? 'upcoming' : 'now';
  }
  return isBefore(item.dueOn, today) ? 'late' : 'upcoming';
}

export interface SnapshotPerson {
  id: string;
  name: string;
  // The company this snapshot is of sponsors the person's visa, so the visa and Emirates ID
  // renewals are its requirements. Absent reads as not sponsored here.
  sponsoredHere?: boolean;
  passportExpiry: Field<IsoDate> | null;
  visaExpiry: Field<IsoDate> | null;
  emiratesIdExpiry: Field<IsoDate> | null;
}

// Everything the onboarding has for one company, as entered so far. Any part may be missing.
export interface CompanySnapshot {
  companyId: string;
  licenceStatus?: Field<LicenceStatus> | null;
  licenceExpiry?: Field<IsoDate> | null;
  expectedNewExpiry?: Field<IsoDate> | null;
  incorporationDate?: Field<IsoDate> | null;
  premises?: PremisesRecord | null;
  establishmentCard?: Field<IsoDate> | null;
  corporateTax?: CorporateTaxRecord | null;
  vat?: VatRecord | null;
  people?: readonly SnapshotPerson[];
}

// Undated items the year must still show: registering for corporate tax late when the deadline
// fell before the timeline rule (no date to show).
export interface LateItem {
  id: string;
  kind: 'corporate-tax-registration';
  companyId: string;
  basis: RuleBasis[];
}

export interface SnapshotDates {
  dated: DatedItem[];
  late: LateItem[];
}

function item(
  base: Omit<DatedItem, 'reminders'>,
  offsets: readonly number[],
  today: IsoDate,
): DatedItem {
  return { ...base, reminders: reminderDates(base.dueOn, offsets, today) };
}

export function snapshotDates(
  snapshot: CompanySnapshot,
  federal: FederalRules,
  today: IsoDate,
): SnapshotDates {
  const { companyId } = snapshot;
  const dated: DatedItem[] = [];
  const late: LateItem[] = [];
  const own = { companyId, personId: null, personName: null };

  const renewal = licenceRenewalDate(
    snapshot.licenceStatus,
    snapshot.licenceExpiry,
    snapshot.expectedNewExpiry,
  );
  if (renewal !== null) {
    dated.push(
      item(
        { ...own, id: `${companyId}:licence`, kind: 'licence-renewal', dueOn: renewal, basis: [] },
        LICENCE_REMINDER_DAYS,
        today,
      ),
    );
    dated.push(
      item(
        {
          ...own,
          id: `${companyId}:decision`,
          kind: 'decision-point',
          dueOn: decisionPointDate(renewal),
          basis: [],
        },
        [],
        today,
      ),
    );
  }

  const leaseEnd = knownValue(snapshot.premises?.endDate);
  if (leaseEnd !== null) {
    dated.push(
      item(
        { ...own, id: `${companyId}:lease`, kind: 'lease-end', dueOn: leaseEnd, basis: [] },
        LEASE_REMINDER_DAYS,
        today,
      ),
    );
  }

  const card = knownValue(snapshot.establishmentCard);
  if (card !== null) {
    dated.push(
      item(
        { ...own, id: `${companyId}:card`, kind: 'establishment-card', dueOn: card, basis: [] },
        CARD_REMINDER_DAYS,
        today,
      ),
    );
  }

  for (const person of snapshot.people ?? []) {
    const who = { companyId, personId: person.id, personName: person.name };
    const passport = passportAlerts(person.passportExpiry, federal);
    if (passport.kind === 'dated') {
      dated.push(
        item(
          {
            ...who,
            id: `${person.id}:passport-early`,
            kind: 'passport-early-warning',
            dueOn: passport.earlyWarningOn,
            basis: [],
          },
          [0],
          today,
        ),
      );
      dated.push(
        item(
          {
            ...who,
            id: `${person.id}:passport`,
            kind: 'passport-alert',
            dueOn: passport.alertOn,
            basis: passport.basis,
          },
          [0],
          today,
        ),
      );
    }
    const visa = knownValue(person.visaExpiry);
    if (visa !== null) {
      dated.push(
        item(
          { ...who, id: `${person.id}:visa`, kind: 'visa-expiry', dueOn: visa, basis: [] },
          VISA_REMINDER_DAYS,
          today,
        ),
      );
    }
    const emiratesId = knownValue(person.emiratesIdExpiry);
    if (emiratesId !== null) {
      dated.push(
        item(
          {
            ...who,
            id: `${person.id}:emirates-id`,
            kind: 'emirates-id-expiry',
            dueOn: emiratesId,
            basis: [],
          },
          VISA_REMINDER_DAYS,
          today,
        ),
      );
    }
  }

  const tax = snapshot.corporateTax ?? null;
  if (tax !== null) {
    const registration = corporateTaxRegistration(
      { registered: tax.registered, incorporationDate: snapshot.incorporationDate, today },
      federal,
    );
    if (registration.kind === 'register-by') {
      dated.push(
        item(
          {
            ...own,
            id: `${companyId}:ct-registration`,
            kind: 'corporate-tax-registration',
            dueOn: registration.dueOn,
            basis: registration.basis,
          },
          CT_REGISTRATION_REMINDER_DAYS,
          today,
        ),
      );
    } else if (registration.kind === 'late') {
      if (registration.dueOn === null) {
        late.push({
          id: `${companyId}:ct-registration`,
          kind: 'corporate-tax-registration',
          companyId,
          basis: registration.basis,
        });
      } else {
        dated.push(
          item(
            {
              ...own,
              id: `${companyId}:ct-registration`,
              kind: 'corporate-tax-registration',
              dueOn: registration.dueOn,
              basis: registration.basis,
            },
            [],
            today,
          ),
        );
      }
    }
    // Not registered and no first period end entered: calculated from the rule when the year end
    // gives exactly one candidate (CTP003).
    const entered = knownValue(tax.firstTaxPeriodEnd);
    const derived =
      entered === null && knownValue(tax.registered) === 'no'
        ? firstTaxPeriod(snapshot.incorporationDate, tax.financialYearEnd, federal)
        : null;
    const calculated = derived?.kind === 'calculated' ? derived : null;
    const taxReturn = nextCorporateTaxReturn(
      {
        firstTaxPeriodEnd:
          calculated === null
            ? tax.firstTaxPeriodEnd
            : { state: 'known', value: calculated.periodEnd, origin: 'user', enteredOn: today },
        financialYearEnd: tax.financialYearEnd,
        today,
      },
      federal,
    );
    if (taxReturn.kind === 'dated') {
      dated.push(
        item(
          {
            ...own,
            id: `${companyId}:ct-return`,
            kind: 'corporate-tax-return',
            dueOn: taxReturn.dueOn,
            basis:
              calculated === null ? taxReturn.basis : [...calculated.basis, ...taxReturn.basis],
            first: taxReturn.first,
            calculated: calculated !== null,
          },
          CT_RETURN_REMINDER_DAYS,
          today,
        ),
      );
    }
  }

  const vat = snapshot.vat ?? null;
  if (vat !== null && knownValue(vat.registered) === 'yes') {
    const vatReturn = nextVatReturn(
      { filingPeriod: vat.filingPeriod, periodEnd: vat.periodEnd, today },
      federal,
    );
    if (vatReturn.kind === 'dated') {
      dated.push(
        item(
          {
            ...own,
            id: `${companyId}:vat-return`,
            kind: 'vat-return',
            dueOn: vatReturn.dueOn,
            basis: vatReturn.basis,
          },
          VAT_RETURN_REMINDER_DAYS,
          today,
        ),
      );
    }
  }

  return { dated: dated.sort(byDate), late };
}

function byDate(a: DatedItem, b: DatedItem): number {
  return compareDates(a.dueOn, b.dueOn) || a.id.localeCompare(b.id);
}

// A date is sourced when it is the person's own answer or every rule under it is confirmed.
export function isSourced(item: Pick<DatedItem, 'basis'>): boolean {
  return item.basis.every((basis) => basis.grade === 'confirmed');
}

export type NextItem = DatedItem | LateItem;

export function isDated(entry: NextItem): entry is DatedItem {
  return 'dueOn' in entry;
}

export interface Year {
  // The three things to act on first, by urgency. A marker still ahead is not listed here.
  next: NextItem[];
  // Every item, sourced dates first, each group by date.
  all: DatedItem[];
  late: LateItem[];
  // A person's papers, once across companies.
  personal: DatedItem[];
}

// Step 8 and section D: the year across every company, a person's papers shown once.
export function combinedYear(
  snapshots: readonly CompanySnapshot[],
  federal: FederalRules,
  today: IsoDate,
): Year {
  const seen = new Set<string>();
  const dated: DatedItem[] = [];
  const late: LateItem[] = [];
  for (const snapshot of snapshots) {
    const dates = snapshotDates(snapshot, federal, today);
    for (const entry of dates.dated) {
      if (!seen.has(entry.id)) {
        seen.add(entry.id);
        dated.push(entry);
      }
    }
    late.push(...dates.late);
  }
  dated.sort(byDate);
  const sourced = dated.filter(isSourced);
  const rest = dated.filter((entry) => !isSourced(entry));
  const withStatus = (status: ItemStatus) =>
    dated.filter((entry) => itemStatus(entry, today) === status);
  const upcomingDeadlines = withStatus('upcoming').filter(
    (entry) => !MARKER_KINDS.includes(entry.kind),
  );
  const soon = upcomingDeadlines.filter((entry) => daysUntil(entry.dueOn, today) <= DUE_SOON_DAYS);
  const later = upcomingDeadlines.filter((entry) => daysUntil(entry.dueOn, today) > DUE_SOON_DAYS);
  return {
    // By urgency: overdue deadlines, deadlines within DUE_SOON_DAYS, markers whose day has come,
    // then the other deadlines by date.
    next: [...late, ...withStatus('late'), ...soon, ...withStatus('now'), ...later].slice(0, 3),
    all: [...sourced, ...rest],
    late,
    personal: dated.filter((entry) => PERSONAL_KINDS.includes(entry.kind)),
  };
}

// Step 6: the audit rule for a company claiming Qualifying Free Zone Person status.
export function qfzpAudit(
  intent: Field<'yes' | 'no'> | null | undefined,
  federal: FederalRules,
): { required: boolean; basis: RuleBasis[] } | null {
  if (knownValue(intent) !== 'yes') {
    return null;
  }
  const rule = federal.corporateTax.qfzpAuditedAccounts;
  return { required: rule.value, basis: [basisOf(rule)] };
}
