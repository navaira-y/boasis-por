import type { FederalRules, Field, IsoDate } from '@boasis/schema';
import { addMonths } from './calendar';
import { basisOf, knownValue, type RuleBasis } from './fields';

// Onboarding v2 sections C step 3, E and I: the passport needs at least six months left to renew
// a residence visa (federal, ICP, content/federal.json), the same under every authority. The alert
// falls when that much is left.

// The early warning is a Boasis reminder schedule (onboarding v2 section E), not a legal rule, so
// it lives here with the other schedules rather than in content.
export const PASSPORT_EARLY_WARNING_MONTHS = 9;

export type PassportAlerts =
  | { kind: 'dated'; earlyWarningOn: IsoDate; alertOn: IsoDate; basis: RuleBasis[] }
  | { kind: 'unknown' };

export function passportAlerts(
  expiry: Field<IsoDate> | null | undefined,
  federal: FederalRules,
): PassportAlerts {
  const known = knownValue(expiry);
  if (known === null) {
    return { kind: 'unknown' };
  }
  const months = federal.passport.residenceRenewalMonths;
  return {
    kind: 'dated',
    earlyWarningOn: addMonths(known, -PASSPORT_EARLY_WARNING_MONTHS),
    alertOn: addMonths(known, -months.value),
    basis: [basisOf(months)],
  };
}
