import { redirect } from 'next/navigation';
import { serverSupabase } from '@/lib/supabase';
import { hasProfile, routeForUser } from '@/lib/access';
import { listPlans } from '@/lib/plans-server';
import { ENTRY_COPY } from '@/lib/copy';
import { readEmailMode } from '@/lib/email-mode';
import { EntryForm } from './entry-form';

/**
 * The signup screen, shared by / (which opens straight here) and /signup
 * (where the email link lands). A verified session that already has a profile
 * belongs elsewhere, and visitors who clicked the link inside the email arrive
 * already verified: they pick up at the password step with the code skipped.
 */
export async function EntryPage({ linkExpired = false }: { linkExpired?: boolean } = {}) {
  const supabase = await serverSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let resumeEmail: string | null = null;
  if (user?.email != null) {
    if (await hasProfile(supabase, user.id)) {
      redirect(await routeForUser(supabase, user.id));
    }
    if (user.email_confirmed_at != null) resumeEmail = user.email;
  }

  const { plans } = await listPlans();
  // Whether the project has a sender of its own only changes a courtesy line on
  // the inbox screen (the built-in mailer sends about two an hour). Whether the
  // EMAIL carries the six digits is decided by the Supabase template, which the
  // app cannot read, so the screen always offers both the code and the link.
  const emailMode = await readEmailMode();

  return (
    <main className="shell stage">
      <section className="panel" aria-labelledby="entry-heading">
        <EntryForm
          plans={plans}
          resumeEmail={resumeEmail}
          notice={linkExpired ? ENTRY_COPY.linkExpired : null}
          limitedSender={!emailMode.ownSender}
        />
      </section>
      <aside className="aside">
        <h2>Know, tell, guide, keep.</h2>
        <p>
          Boasis Portal holds one company file for a founder running a free zone company in the
          UAE, and uses it to tell you what is due, in time, by email.
        </p>
        <ul className="bullets">
          <li>
            <span className="dot" aria-hidden="true">
              ◆
            </span>
            <span>
              <b>Know</b>
              <span>Your licence, people, office, card and tax details in one place.</span>
            </span>
          </li>
          <li>
            <span className="dot" aria-hidden="true">
              ◷
            </span>
            <span>
              <b>Tell</b>
              <span>Every date and step that applies to your company, before it is due.</span>
            </span>
          </li>
          <li>
            <span className="dot" aria-hidden="true">
              ≣
            </span>
            <span>
              <b>Guide</b>
              <span>Plain steps for your zone, with the official source next to every rule.</span>
            </span>
          </li>
          <li>
            <span className="dot" aria-hidden="true">
              ▣
            </span>
            <span>
              <b>Keep</b>
              <span>Documents and their dates, ready when a bank or an auditor asks.</span>
            </span>
          </li>
        </ul>
        <p className="lede-note">
          A full account is created first, then your company walks through onboarding. Your first
          year is free for one company, and no card is asked for at the door. Boasis never files
          anything with a government or a zone: you or your agent do that.
        </p>
      </aside>
    </main>
  );
}
