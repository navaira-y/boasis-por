/**
 * The gate decision, as a pure table. Middleware only collects facts (is there
 * a session, is the inbox confirmed, what does the subscription say) and then
 * applies this function, so the rules are unit tested instead of living in
 * branches nobody can reach in a test.
 *
 * No server-only imports here: middleware runs in the edge runtime.
 *
 * Rules:
 *   no session            -> sign in (returning visitors only)
 *   session, inbox open   -> finish the entry flow at /signup
 *   /billing, verified    -> allowed: that page IS where payment lands
 *   /portal, verified     -> only with an ACTIVE subscription, else /billing
 */

export type SubscriptionStatus = 'pending' | 'incomplete' | 'active' | 'past_due' | 'canceled';

export interface GateFacts {
  path: string;
  signedIn: boolean;
  emailConfirmed: boolean;
  /** null when the account has no subscription row at all. */
  status: SubscriptionStatus | null;
}

export type GateAction = 'allow' | 'to-signin' | 'to-signup' | 'to-billing';

export function isBillingPath(path: string): boolean {
  return path === '/billing' || path.startsWith('/billing/');
}

export function isPortalPath(path: string): boolean {
  return path === '/portal' || path === '/portal/' || path.startsWith('/portal/');
}

export function decideGate(facts: GateFacts): GateAction {
  if (!facts.signedIn) return 'to-signin';
  if (!facts.emailConfirmed) return 'to-signup';
  if (isBillingPath(facts.path)) return 'allow';
  if (isPortalPath(facts.path)) return facts.status === 'active' ? 'allow' : 'to-billing';
  return 'allow';
}
