import type { AuthorityFile } from '@boasis/schema';
import { describe, expect, it } from 'vitest';
import {
  afterExpiry,
  businessCentreLeaseMinimum,
  establishmentCardRule,
  leaseRequiredToRenew,
  visaQuotaPrefill,
  zoneRenewalFact,
  zoneShortName,
} from './zone-facts';
import { fact, srtipAuthority } from './testing/fixtures';

function withProposed(fields: Record<string, unknown>): AuthorityFile {
  return srtipAuthority({
    proposedFields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        value === null ? fact(null, 'unclear') : fact(value),
      ]),
    ),
  });
}

describe('zone renewal facts', () => {
  it('reads a proposed fact of the right shape, and unknown otherwise', () => {
    const zone = withProposed({
      'licence.afterExpiry': 'No grace period.',
      'licence.graceDays': 'x',
    });
    expect(afterExpiry(zone)?.value).toBe('No grace period.');
    expect(zoneRenewalFact(zone, 'licence.graceDays')).toBeNull();
    expect(afterExpiry(srtipAuthority())).toBeNull();
    expect(afterExpiry(null)).toBeNull();
  });

  it('confirms the lease rule from the zone, or from a confirmed minimum', () => {
    expect(
      leaseRequiredToRenew(withProposed({ 'licence.leaseMustBeValidToRenew': true })).kind,
    ).toBe('confirmed');
    expect(
      leaseRequiredToRenew(
        srtipAuthority({
          proposedFields: { 'licence.leaseMustBeValidToRenew': fact(true, 'reported') },
        }),
      ).kind,
    ).toBe('unknown');
    expect(leaseRequiredToRenew(withProposed({ 'licence.leaseMinRemainingDays': 90 })).kind).toBe(
      'confirmed',
    );
    expect(
      leaseRequiredToRenew(withProposed({ 'licence.leaseMustBeValidToRenew': null })).kind,
    ).toBe('unknown');
  });

  it('gives the business centre minimum only for a flexi desk or business centre', () => {
    const zone = withProposed({ 'licence.leaseMinRemainingDays': 90 });
    expect(businessCentreLeaseMinimum(zone, 'flexi-desk')?.value).toBe(90);
    expect(businessCentreLeaseMinimum(zone, 'office')).toBeNull();
  });
});

describe('the quota prefill and the establishment card rule', () => {
  it('prefills the quota only for a confirmed flexi desk number', () => {
    const zone = srtipAuthority({ premises: { flexiDeskVisaQuota: fact(1) } });
    expect(visaQuotaPrefill(zone, 'flexi-desk')?.value).toBe(1);
    expect(visaQuotaPrefill(zone, 'office')).toBeNull();
    expect(
      visaQuotaPrefill(
        srtipAuthority({ premises: { flexiDeskVisaQuota: fact(2, 'reported') } }),
        'flexi-desk',
      ),
    ).toBeNull();
  });

  it('confirms the card rule per zone and is unknown elsewhere', () => {
    const zone = srtipAuthority({
      people: { establishmentCardNeededForVisas: fact(true) },
    });
    expect(establishmentCardRule(zone).kind).toBe('confirmed');
    expect(establishmentCardRule(srtipAuthority()).kind).toBe('unknown');
  });

  it('names a zone by a short alias', () => {
    expect(zoneShortName('Dubai Multi Commodities Centre (DMCC)', ['DMCC'])).toBe('DMCC');
    expect(zoneShortName('Meydan Free Zone', [])).toBe('Meydan Free Zone');
  });
});
