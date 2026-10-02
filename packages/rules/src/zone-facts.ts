import {
  ZoneRenewalFacts,
  type AuthorityFile,
  type Fact,
  type OfficeKind,
  type ZoneRenewalFactKey,
} from '@boasis/schema';
import { basisOf, type RuleBasis } from './fields';

// Onboarding v2 steps 2, 4 and 5, and Appendix A: what the authority file says about one zone,
// read with its source and grade. A fact that is absent, unknown or of the wrong shape reads as
// unknown; nothing here fills a gap with a guess.

type RenewalValue<K extends ZoneRenewalFactKey> = NonNullable<ZoneRenewalFacts[K]['value']>;

export interface KnownFact<T> {
  value: T;
  basis: RuleBasis;
}

// One proposed renewal fact of the zone, when the file carries it with a value.
export function zoneRenewalFact<K extends ZoneRenewalFactKey>(
  authority: AuthorityFile | null,
  key: K,
): KnownFact<RenewalValue<K>> | null {
  const raw = authority?.proposedFields?.[key];
  if (raw === undefined) {
    return null;
  }
  const parsed = ZoneRenewalFacts.shape[key].safeParse(raw);
  if (!parsed.success || parsed.data.value === null) {
    return null;
  }
  const fact = parsed.data as Fact<RenewalValue<K>>;
  if (fact.value === null) {
    return null;
  }
  return { value: fact.value, basis: basisOf(fact) };
}

// The zone's short name for a sentence ("DMCC requires..."): its first alias when that is short,
// else its full name.
export function zoneShortName(name: string, aliases: readonly string[]): string {
  const alias = aliases[0];
  return alias !== undefined && alias.length <= 12 ? alias : name;
}

// Step 4: whether the zone requires a valid lease to renew the licence. Confirmed when the file
// says so with grade confirmed, or when it gives a confirmed minimum the lease must have left.
export type LeaseToRenew = { kind: 'confirmed'; basis: RuleBasis } | { kind: 'unknown' };

export function leaseRequiredToRenew(authority: AuthorityFile | null): LeaseToRenew {
  const must = zoneRenewalFact(authority, 'licence.leaseMustBeValidToRenew');
  if (must !== null && must.value && must.basis.grade === 'confirmed') {
    return { kind: 'confirmed', basis: must.basis };
  }
  const minimum = zoneRenewalFact(authority, 'licence.leaseMinRemainingDays');
  if (minimum !== null && minimum.basis.grade === 'confirmed') {
    return { kind: 'confirmed', basis: minimum.basis };
  }
  return { kind: 'unknown' };
}

// Step 4: the business centre lease minimum, where the zone confirms one ("Renew your lease if
// it has under 90 days left", DMCC). Stated for business centre units, so only a flexi desk or
// business centre office gets it.
export function businessCentreLeaseMinimum(
  authority: AuthorityFile | null,
  officeKind: OfficeKind | null,
): KnownFact<number> | null {
  if (officeKind !== 'flexi-desk') {
    return null;
  }
  const minimum = zoneRenewalFact(authority, 'licence.leaseMinRemainingDays');
  return minimum !== null && minimum.basis.grade === 'confirmed' ? minimum : null;
}

// Step 5: the quota prefill, only where the zone confirms a number for the office type.
export function visaQuotaPrefill(
  authority: AuthorityFile | null,
  officeKind: OfficeKind | null,
): KnownFact<number> | null {
  if (officeKind !== 'flexi-desk') {
    return null;
  }
  const quota = authority?.premises.flexiDeskVisaQuota;
  if (quota?.value == null || quota.grade !== 'confirmed') {
    return null;
  }
  return { value: quota.value, basis: basisOf(quota) };
}

// Step 5: whether a valid establishment card is needed for visa services, per zone.
export type EstablishmentCardRule = { kind: 'confirmed'; basis: RuleBasis } | { kind: 'unknown' };

export function establishmentCardRule(authority: AuthorityFile | null): EstablishmentCardRule {
  const rule = authority?.people.establishmentCardNeededForVisas;
  if (rule?.value !== true || rule.grade !== 'confirmed') {
    return { kind: 'unknown' };
  }
  return { kind: 'confirmed', basis: basisOf(rule) };
}

// Step 2: what the zone says happens after the licence expires, in words.
export function afterExpiry(authority: AuthorityFile | null): KnownFact<string> | null {
  return zoneRenewalFact(authority, 'licence.afterExpiry');
}

// Step 2: the zone's renewal checklist and contact, shown until the renewal workflow is built.
export interface RenewalHelp {
  checklist: KnownFact<string[]> | null;
  portal: KnownFact<string> | null;
}

export function renewalHelp(authority: AuthorityFile | null): RenewalHelp {
  const checklist = authority?.licence.renewalChecklist;
  const portal = authority?.identity.portalAddress;
  return {
    checklist:
      checklist?.value == null || checklist.value.length === 0
        ? null
        : { value: checklist.value, basis: basisOf(checklist) },
    portal:
      portal?.value == null || portal.value === ''
        ? null
        : { value: portal.value, basis: basisOf(portal) },
  };
}

// Step 2: how the zone takes applications, for the "who handles your zone paperwork" question.
export function submissionChannel(authority: AuthorityFile | null): KnownFact<string> | null {
  const channel = authority?.identity.submissionChannel;
  if (channel?.value == null || channel.value === '') {
    return null;
  }
  return { value: channel.value, basis: basisOf(channel) };
}
