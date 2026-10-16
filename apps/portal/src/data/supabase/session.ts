import { writeSession } from '../../lib/session';
import { accounts } from './accounts';
import { requireUser } from './actor';

/**
 * The server gate verifies the cookie, but the team's screens read a separate
 * display session. Populate it from the authenticated account before rendering
 * those screens, never from an old demo login or URL data. It holds no tokens
 * and grants no access: Supabase auth and RLS still decide every request.
 */
export async function restorePortalSession(): Promise<void> {
  // Do not leave a previous account's display session behind if auth fails.
  writeSession(null);
  const user = await requireUser();
  const account = await accounts.get(user.id);
  if (account === null) {
    throw new Error('Your account could not be loaded. Please return to sign in.');
  }
  const [firstName = '', ...rest] = account.fullName.trim().split(/\s+/);
  writeSession({
    email: account.email,
    firstName,
    lastName: rest.join(' '),
    phone: '',
    timeZone: 'Asia/Dubai',
    notificationEmail: account.email,
    passwordChangedOn: null,
    twoStepOn: account.twoStepOn,
    signedInOn: null,
    actingAs: null,
  });
}
