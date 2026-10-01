# Phase 1 plan — price-based access

## Milestones

- [x] M0 Repo scaffold, docs, content system skeleton, DB migration + RLS
- [ ] M1 Supabase project wired (URL + anon key in `apps/web/.env.local`), migration applied
- [x] M2 Signup: name + email + inline 6-digit code, password (+ breach check), plan picker, terms; 2-step flow (Account → Payment); payment page shows selected plan
- [ ] M3 Pending → checkout (stub) → webhook → active; `/billing/pending` gate in middleware
- [ ] M4 Entitlements enforced: plan company limits, upgrade prompt copy per spec
- [~] M5 Stripe implemented (Trio checkout + webhooks + cancel/past_due); needs keys + `trio_monthly` price per docs/STRIPE.md. Solo free-year needs no gateway; Enterprise is manual. Invoice email still open; year-2 dunning DONE (cron + reminders + past_due lock + renewal checkout, needs CRON_SECRET + scheduler per docs/DEPLOY.md)
- [ ] M6 Hardening pass: rate limits, RLS tests in CI, Sentry, audit review

## Entry contract (from boasis.ae plans buttons)

Marketing buttons link to:

```
/signup
```

No plan is preselected anywhere. The plan is chosen on the payment step:
Solo (free 12 months, then AED 30) activates immediately; Trio (AED 90)
checks out online; Enterprise links to contact.

## Definition of done (Phase 1)

1. A visitor can sign up, verify email, pay (stub in dev), and land activated.
2. An unpaid/unverified account cannot open any portal route (middleware + RLS both enforce).
3. A `solo` account adding a 2nd company sees the exact spec copy and an upgrade path;
   the API refuses the insert even if the UI is bypassed.
4. `npm run validate:content`, `npm run typecheck`, `npm run test` all green.
5. No secret in the repo; service-role key referenced only from server code.
