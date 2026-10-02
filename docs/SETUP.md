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

## 3. Run

```bash
npm install
npm run validate:content
npm run dev        # http://localhost:3000
```

## 4. Auth URLs (Supabase dashboard → Auth → URL configuration)

- Site URL: `http://localhost:3000` (dev) / production URL (prod)
- Redirect allow-list: add `{SITE_URL}/auth/callback`

## 5. OTP email template (Supabase dashboard → Auth → Email Templates → Magic Link)

Signup sends a 6-digit code via `signInWithOtp`, which uses the Magic Link
template. Confirm the template contains `{{ .Token }}` so the email shows the
code (and keep the link — clicking it also verifies, and the signup page
resumes where the user left off).

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
