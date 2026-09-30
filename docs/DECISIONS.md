# Decision log

Append-only. Newest at the bottom. Format: date · decision · why · alternatives rejected.

- 2026-09-29 · **Next.js 15 (TypeScript) single codebase for web + API** · One language, one deploy, fastest hiring pool; API routes + server actions cover Phase 1–2 needs. Rejected: separate NestJS backend (unneeded ops weight before product-market fit).
- 2026-09-29 · **Supabase Postgres as DB + Auth + Storage, RLS as the tenant-isolation guarantee** · Gets us Postgres + auth + vault fast; RLS enforced at DB level so a buggy API route can't leak company data. Rejected: self-hosted Postgres (no DevOps person yet). Exit strategy: it is plain Postgres; migrations stay portable.
- 2026-09-29 · **Region: closest to UAE (Mumbai first choice, else Singapore)** · Latency for UAE users + data-residency posture. Supabase has no UAE region; revisit when scale justifies dedicated infra.
- 2026-09-29 · **Supabase project settings: Data API ON, auto-expose new tables OFF, automatic RLS ON** · Least privilege by default; every table locked until a reviewed policy opens it.
- 2026-09-29 · **Billing is provider-agnostic behind a `BillingProvider` interface; `stub` provider for dev** · Payment provider undecided; the signup→pay→activate flow must work end-to-end now and accept Stripe/Telr/PayTabs later with zero flow changes. Stub is hard-disabled in production.
- 2026-09-29 · **Charge timing: plan selected at signup, account created `pending`, activated on payment confirmation** · Implements "no pay, no account" without the failure mode of money-taken-but-no-account. Matches spec (plan at Step 0) while payment timing stays open with the client.
- 2026-09-29 · **One subscription row per account (status machine), history via audit log** · v1 has 2 plans and upgrades, not complex multi-subscription needs. Revisit if enterprise pooled billing appears.
- 2026-09-29 · **Zone rules as versioned JSON in repo, validated by schema in CI** · Spec requires rules-with-source-and-grade in content, never code; git gives review + history; CI validation stops a bad file breaking the portal.
- 2026-09-29 · **No document scanner / AI pipeline in Phase 1** · Spec v2 explicitly defers the scanner (uploads go to vault only, user types fields). We will not build OCR/AI extraction until Phase 2.
- 2026-09-29 · **Single AI/OCR pipeline when Phase 2 arrives (no dual Python+AI day one)** · Two extraction pipelines doubles maintenance with no DevOps cover; add an OCR fast-path only if cost/latency data demands it.
- 2026-09-29 · **Everything Dockerized from day one; hosting Railway for now** · Managed ops while team is small; containers keep the UAE-region migration path open.
- 2026-09-29 · **All dates computed and compared in Asia/Dubai** · Reminder correctness is legal-grade; server never trusts client timezone.
- 2026-09-30 · **Zero npm vulnerabilities via vitest 4.1.11 + postcss 8.5.28 override; Next stays on 15.x** · All 7 findings (1 critical, 2 high) patched without framework majors: vitest 2→4 is API-compatible for our tests, postcss 8.4→8.5 is a safe minor. Rejected: `npm audit fix --force` (would jump Next 15→16 + vitest 5, destabilizing the app mid-testing).
- 2026-09-30 · **Email verification = 6-digit OTP code inline on signup (replaces separate verify-by-link page)** · Client feedback: fewer steps, matches standard apps. Flow is now 2 steps (Account → Payment). Code checked server-side via Supabase verifyOtp; account creation refuses unverified sessions; resend has 60s cooldown + hourly caps.
