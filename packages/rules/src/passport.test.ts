import { describe, expect, it } from 'vitest';
import { passportAlerts } from './passport';
import { FEDERAL } from './testing/federal';
import { known, notSure, skipped } from './testing/fields';

describe('passport alerts', () => {
  it('alerts at six months left (federal, ICP) and warns early at nine', () => {
    const alerts = passportAlerts(known('2027-09-30'), FEDERAL);
    expect(alerts).toMatchObject({
      kind: 'dated',
      earlyWarningOn: '2026-12-30',
      alertOn: '2027-03-30',
    });
    if (alerts.kind === 'dated') {
      expect(alerts.basis[0]?.source).toContain('https://icp.gov.ae/');
    }
  });

  it('is unknown without a passport expiry', () => {
    expect(passportAlerts(notSure(), FEDERAL)).toEqual({ kind: 'unknown' });
    expect(passportAlerts(skipped(), FEDERAL)).toEqual({ kind: 'unknown' });
    expect(passportAlerts(null, FEDERAL)).toEqual({ kind: 'unknown' });
  });
});
