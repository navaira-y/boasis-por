# Setup

## Prereqs

- Node 20+
- A Supabase project (see stack doc for required project settings:
  Data API **on**, auto-expose new tables **off**, automatic RLS **on**)

## 1. Env

```bash
cp .env.example apps/web/.env.local
```

Paste from Supabase → Project Settings → API:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only — never share, never commit)

Then generate a cron secret (any long random string):

```bash
openssl rand -hex 32   # paste into CRON_SECRET=
```

## 2. Database

Apply migrations (Supabase SQL editor, or CLI when linked):

```bash
# CLI route (needs project linked once):
supabase db push
```

Run migrations **in order**, once each (SQL editor: paste whole file → Run):
1. `supabase/migrations/0001_phase1_core.sql` — tables + RLS + Solo/Trio seeds
2. `supabase/migrations/0002_three_plans.sql` — Enterprise plan, free-year
   column, plan choice at payment (`select * from plans` must show 3 rows)
3. `supabase/migrations/0003_renewals.sql` — renewal reminder ledger
   (`select * from subscription_reminders` must return 0 rows, no error)
4. `supabase/migrations/0004_portal_core.sql` — portal interior real data:
   company facts + people/offices/documents/cards/history/audit tables with
   owner-only RLS (`select * from company_history` must return 0 rows, no error)

## 3. Run

```bash
npm install
npm run validate:content
npm run dev        # http://localhost:3000
```

## 4. Auth URLs (Supabase dashboard → Auth → URL configuration)

- Site URL: `http://localhost:3000` (dev) / production URL (prod)
- Redirect allow-list: add `{SITE_URL}/auth/callback`

## 5. Auth email settings (Supabase dashboard → Auth)

**5a. Turn OFF "Confirm email"** (Auth → Sign In / Up → Email → Confirm
email **OFF**). Our 6-digit code IS the confirmation. Leaving it ON makes
Supabase send new users a link-only "Confirm your email address" email with
no code — the signup cannot proceed.

**5b. Magic Link template** (Auth → Email Templates → Magic Link): signup
sends a 6-digit code via `signInWithOtp`, which uses this template. Replace
its body with this (code first, link as backup — the link resumes signup):

```html
<h2>Your Boasis code: {{ .Token }}</h2>
<p>Enter this 6-digit code to verify your email. It expires in a few minutes.</p>
<p>Or verify on this device instead: <a href="{{ .ConfirmationURL }}">Verify my email</a></p>
<p>If you didn't ask for this, just ignore this email.</p>
```

## 6. Billing (dev)

`BILLING_PROVIDER=stub` gives a fake checkout that activates the account —
**it refuses to run when `NODE_ENV=production`** unless the deploy sets
`DEMO_ALLOW_STUB=true` (demo deploys only, never real production). Real
providers are added under `apps/web/lib/billing/` behind the same interface.

## 7. Renewal reminders (dev)

Reminder emails default to the log (`EMAIL_PROVIDER=log`): run the daily job
by hand and watch the terminal:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/renewals
```

To really send mail via Google Workspace (same as the boasis.ae forms),
set `EMAIL_PROVIDER=smtp` + `SMTP_USER` + `SMTP_PASS` (App Password, not the
login password) + `EMAIL_FROM`. Resend works too (`EMAIL_PROVIDER=resend` +
`RESEND_API_KEY` + `EMAIL_FROM`). Days are counted in Asia/Dubai; the schedule is 30/14/7/1 days
before the period ends, then access pauses until the renewal is paid.

## 8. Portal data layer (supabase mode)

The portal (`apps/portal`) reads the mock in dev by default. For real data,
build with `VITE_DATA_MODE=supabase` plus the web app's Supabase URL and anon
key as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (see
`apps/portal/.env.example`; Railway holds the production values). The client
shares the web app's cookie session, so same-origin serving signs it in as
the payer with no token hand-off. Slice 1 covers companies, offices, people,
documents, cards, history and audit; the other repos fail loudly until their
slice lands.
