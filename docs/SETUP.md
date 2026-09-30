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

## 2. Database

Apply migrations (Supabase SQL editor, or CLI when linked):

```bash
# CLI route (needs project linked once):
supabase db push
```

`supabase/migrations/0001_phase1_core.sql` creates tables + RLS + seeds the two plans.

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
**it refuses to run when `NODE_ENV=production`**. Real providers are added under
`apps/web/lib/billing/` behind the same interface.
