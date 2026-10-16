import type { Metadata } from 'next';
import { EntryPage } from './(auth)/signup/entry-page';

/**
 * The root of this service opens STRAIGHT at signup: there is no marketing
 * homepage here, the marketing site is boasis.ae. Same screen as /signup, so
 * the email-link resume path and the front door can never drift apart.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Start your company file',
};

export default EntryPage;
