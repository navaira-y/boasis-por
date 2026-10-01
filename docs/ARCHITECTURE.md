# Architecture — Phase 1 (price-based access)

## Request path

```
browser ──▶ Next.js (App Router)
               ├── server components / server actions  ──▶ Supabase (RLS enforced)
               ├── /api/billing/* (checkout, webhooks) ──▶ BillingProvider ──▶ gateway
               └── middleware: session + activation gate
```

- Reads use the **anon key + RLS** (user can only ever see their own rows, even if our code is wrong).
- Writes that cross trust boundaries (profiles, subscriptions, activation) go through **server actions /
  API routes using the service-role client**, after validating session + input with Zod.
- The **service-role key never reaches the browser** (no `NEXT_PUBLIC_` prefix, only imported in server code).

## Auth → pay → activate (state machine)

```
signup form ──▶ auth.users + profiles row ──▶ subscription row (status=pending)
      │                                              │
      ▼                                              ▼
verify-email ──▶ /billing/pending ──▶ checkout ──▶ webhook confirms ──▶ status=active
                                                                          │
                                                                          ▼
                                                              onboarding unlocked (Phase 2)
```

- Email **must be verified** before anything else opens (spec: verified by link before Step 1).
- Unpaid accounts are fully locked: middleware redirects to `/billing/pending`.
- Webhooks are the **only** path that flips `pending → active` (never a client redirect alone),
  verified by provider signature, idempotent on provider event id.

## Subscription statuses

`pending → active ⇄ past_due → canceled` (+ `incomplete` for abandoned checkouts).
Downgrade below current company count is refused until companies are removed.

## Entitlements (single choke point)

All gating goes through `can(profileId, action)` in `apps/web/lib/entitlements.ts`:

- `companies.add` → active subscription AND company count < plan.max_companies
- `portal.access` → subscription status is `active`

UI hides buttons; **the server re-checks on every mutation**. No `if (plan === ...)` scattered in features.

## Data model (Phase 1 tables)

`profiles` (1:1 auth.users) · `plans` (seeded: solo/trio) · `subscriptions` (1 per profile)
· `companies` (owner + authority + onboarding progress; full fields arrive with onboarding)
· `audit_log` (append-only) · `webhook_events` (idempotency for billing webhooks)

Company rows are RLS-scoped by `owner_profile_id`. Duplicate guard: unique `(authority_id, licence_number)`.

## Content system

`content/authorities/index.json` lists all 42 zones (id, name, grade, deep-content flag).
Deep zone files (e.g. `ifza.json`) arrive with onboarding content; every rule carries
`source` + `grade` (`confirmed` | `reported` | `unknown`). `npm run validate:content`
schema-checks everything and must pass in CI.

## Time, money, mail

- Timezone: **Asia/Dubai** everywhere (reminder math, "days left").
- Money: integer **fils** in code/DB; formatted to AED only at render. No floats.
- Mail: auth mails via Supabase; renewal reminders via the provider-agnostic mailer (`EMAIL_PROVIDER=log` default, `resend` for real sends)
  (deliverability is the product for "Tell").
