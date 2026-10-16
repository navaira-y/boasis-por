'use server';

import { headers } from 'next/headers';
import { checkLimit, clientIp } from '@/lib/rate-limit';
import { activateFreeYearForCurrentUser } from '@/lib/activation';

export interface BillingActionResponse {
  ok: boolean;
  error?: string;
  periodEnd?: string | null;
}

/**
 * "Finish setting up my free year", for the one case where the account exists
 * and the inbox is proven but the subscription row never landed (a database
 * hiccup, or migration 0008 missing on a fresh project).
 */
export async function startFreeYearAction(): Promise<BillingActionResponse> {
  const perIp = checkLimit('activateIp', clientIp(await headers()));
  if (!perIp.ok) return { ok: false, error: 'Too many attempts. Please wait a moment.' };

  const result = await activateFreeYearForCurrentUser();
  if (!result.ok) {
    return {
      ok: false,
      error:
        'Your free year could not be started from here. Nothing is lost: please write to support@boasis.ae and we will finish it for you.',
    };
  }
  return { ok: true, periodEnd: result.periodEnd };
}
