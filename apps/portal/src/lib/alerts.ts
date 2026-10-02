import type { IsoDate, Person } from '@boasis/schema';
import { isBefore, isSponsoredByCompany, passportValidity } from '@boasis/rules';
import { federalRules } from '../content/federal';
import { en } from '../copy/en';
import { formatLong, plural } from './format';
import type { Bundle, Entry } from './entries';

export type AlertKind = 'overdue' | 'passport' | 'insurance';

// One thing that needs a person today: a date that has passed, or a prerequisite that stops a
// renewal (the passport, the health insurance). Lite's "needs you" card, from packages/rules.
export interface Alert {
  readonly id: string;
  readonly kind: AlertKind;
  readonly headline: string;
  readonly companyName: string;
  readonly blocks: string;
  readonly entry: Entry | null;
  readonly person: Person | null;
}

function visaRenewalOf(entries: readonly Entry[], person: Person): Entry | null {
  return (
    entries.find(
      (entry) =>
        entry.requirement?.key === 'residence-visa-renewal' &&
        entry.person?.id === person.id &&
        entry.status === 'upcoming',
    ) ?? null
  );
}

// Overdue first: the only case where the product has already failed. Then what blocks a visa.
export function alertsOf(bundle: Bundle, entries: readonly Entry[], today: IsoDate): Alert[] {
  const companyName = bundle.facts.identity.tradeName;
  const alerts: Alert[] = [];

  for (const entry of entries) {
    if (entry.status === 'upcoming' && entry.days < 0) {
      alerts.push({
        id: `overdue:${entry.id}`,
        kind: 'overdue',
        headline: `${entry.title} was due ${formatLong(entry.date)}.`,
        companyName,
        blocks: plural(-entry.days, en.urgent.overdueBy.one, en.urgent.overdueBy.other),
        entry,
        person: entry.person,
      });
    }
  }

  for (const person of bundle.people) {
    const visaExpiry = person.status.visaExpiry;
    if (visaExpiry === null) {
      continue;
    }
    const renewal = visaRenewalOf(entries, person);
    const name = person.identity.name;
    const passport = passportValidity(person, bundle.authority, federalRules, today, 'renewal');
    if (passport.ok === false && person.identity.passportExpiry !== null) {
      alerts.push({
        id: `passport:${person.id}`,
        kind: 'passport',
        headline: `${name}'s visa can't be renewed, the passport expires ${formatLong(person.identity.passportExpiry)}.`,
        companyName,
        blocks: `Blocks the residence visa renewal on ${formatLong(visaExpiry)}.`,
        entry: renewal,
        person,
      });
    }
    if (isSponsoredByCompany(person)) {
      const policy = person.cover.healthInsurance;
      if (policy === null || isBefore(policy.endDate, today)) {
        alerts.push({
          id: `insurance:${person.id}`,
          kind: 'insurance',
          headline:
            policy === null
              ? `${name}'s visa can't be renewed, no health insurance is on file.`
              : `${name}'s visa can't be renewed, the health insurance ended ${formatLong(policy.endDate)}.`,
          companyName,
          blocks: `Blocks the residence visa renewal on ${formatLong(visaExpiry)}.`,
          entry: renewal,
          person,
        });
      }
    }
  }

  return alerts;
}
