import type { Metadata } from 'next';
import { EntryPage } from './entry-page';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Start your company file',
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>;
}) {
  const params = await searchParams;
  // The email link in the inbox lands here as ?link=expired when it has already
  // been used or has timed out. Saying nothing would leave the visitor staring
  // at an email box with no idea what happened.
  return <EntryPage linkExpired={params.link === 'expired'} />;
}
