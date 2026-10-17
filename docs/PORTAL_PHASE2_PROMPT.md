# PORTAL PHASE 2 — follow-up prompt (paste into the session working on `arena/32c63c62-boasis-por`)

---

You are continuing this branch's work as a senior expert-level full-stack developer, security owner, and designer. Signup/entry on this branch is done and approved. Now build the portal interior phase below. Keep chat replies SHORT; do the work fully. Precedence on conflicts: the Oct 3 meeting decisions first, then the PDFs on `main` (`Boasis-Onboarding-v2.pdf`, `Portal_Tech_Stack.pdf`), then the team's code.

## 1. Verified baseline (checked 2026-10-17 — do not regress it)

- Portal layout/concept is 100% the team's: vs `origin/main`, `apps/portal` differs ONLY by additive `src/data/supabase/*` + tiny wiring (`createRepos`, `package.json`, `.env.example`). Zero screen/component/style/router changes. Keep it that way.
- The clock = `components/Dial/` (Dial + families + position), rendered in `Home`, `CompanyHome`, `YearView`, `home/Panel`. Display it EXACTLY as the team does. Do NOT add activities UI (licence activities stay a passthrough array, unedited — still being figured out).
- Add-company form = team's `screens/sheets/CompanyForm.tsx` (`CompanyFields`: kind free-zone/mainland, authority zone search, legal form, licence number + identity passthrough). Keep these EXACT fields — add nothing, remove nothing.
- Access grants storage is already real (`portal_access_grants` + audit lines). 2FA is NOT real (team `me/Security.tsx` writes mock placeholders) and invite SENDING does not exist (copy strings only). Those two are greenfield real work below.
- No demo data anywhere, ever. Team theme untouched (light/dark/phone as they built).

## 2. Build list (everything the meetings finalized, EXCEPT doc scanning)

1. **2nd-company payment trigger (no gateway):** a Solo user with 1 company who starts adding another sees a portal-themed popup: "Online payment opens soon — the payment gateway will appear here to unlock your second company." No gateway code, no live keys, just the popup at every add-company entry. Solo = 1 company enforced; Trio/Enterprise stay "opens soon".
2. **Two-step verification (real):** TOTP enroll → QR + verify code → enabled, plus change-password and sessions list, inside the team's `me/Security` look. Supabase MFA, best UX (clear states, recovery path, no dead ends). NEVER store a fake "enabled" flag — it must actually gate sign-in.
3. **Invites + roles + access (real, best UX):** owner invites by email + role (Owner/Manager/Adviser) + companies → emailed invite → accept links/creates the account with the grant. Member list per company, change role, remove access, per-company notification toggles. Rules: owners only invite; single-use expiring invite tokens; no self-escalation; every change audited; RLS enforced. Design it like the team would have.
4. **Meeting leftovers (wire real, team screens as-is):** profile/billing/security completion; mainland choice → "coming soon" + waitlist entry; duplicate zone+licence → "already on Boasis, ask its owner to invite you" (reveal nothing); plan-limit message; onboarding steps per `Boasis-Onboarding-v2.pdf` §5 (skip/not-sure → tasks, progress resumes, live dates, values carry state+origin+date, rules show source+grade, expiry-after-issue, vault uploads ≤20MB typed by hand); reminders RECORDED per §7 schedules (sending waits on SMTP).
5. **Clock:** Dial displays exactly as the team built it, fed by real dates. No activities UI (see §1).

## 3. OUT of scope (do not build)

Payment gateway (Ziina keys later), SMTP sending (records only), doc-scanning worker/AI, home/guide section extensions (leave as the team built), countdown, orbit redesign, PDF §13 deferred items, `.env` reads, Company-Legal folders (never touch).

## 4. Security contract (non-negotiable)

No service key in any browser bundle (anon + RLS only in portal); RLS owner/company-scoped on every user table; invites single-use + expiring, accepted only by the invited email; no privilege escalation path (test owner→manager→removed transitions); 2FA actually enforced at sign-in with rate-limited challenges; HIBP passwords; rate limits on entry/invite/2FA endpoints; activation/payment-adjacent writes server-side; no secrets in bundles/logs; `npm audit` clean. Probe-and-name failures (anon-key-in-service-var, missing table) instead of generic errors.

## 5. Testing contract (before ANY handover)

(a) Security pass: leak scan, RLS bypass attempts, invite reuse/expiry/foreign-email attempts, 2FA bypass attempts, escalation attempts, rate-limit abuse — all documented. (b) Functional: every flow in §2 + resume/expired/double-submit/resend edges. (c) Non-functional: cold load sanity, light/dark, phone/desktop. (d) Visitor-side UX review of each touched screen as a stranger. Report per item; nothing handed over red.

## 6. How to work + first task

Stay on this branch, `git add -A` before every commit (sandbox index resets), never force-push, verify push output. Typecheck + tests green before every push; prove serving/security behaviour with real local runs, not reasoning. Never ask for passwords/tokens; if blocked on the user's side (dashboard values, SQL results), ask for exactly that one thing.
**FIRST TASK NOW: implement §2 in order (1→5) on real Supabase data behind the existing gate, keeping §1 pixel-identical. Report: what you built per item, §5 results, and the exact test clicks for the user.**

---
