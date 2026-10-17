# PORTAL PHASE 2 — continuation (paste into the SAME session on `arena/32c63c62-boasis-por`)

---

Act as a senior expert-level full-stack developer, security owner, and designer: security from every side, flag better long-term approaches, best-in-class UX, deliver exactly what is asked.

Next phase on this same branch. Signup/entry and the portal boot fix (258db0c) are done and verified — portal opens with real empty states, no demo data. Now build the portal interior phase below, same proof bar as before (tests + HTTP checks + real browser runs, nothing handed over red).

## Locked baseline (verified 2026-10-17 — do not regress)

- Team's portal layout/concept/theme pixel-identical: vs `origin/main`, `apps/portal` differs only by your additive `src/data/supabase/*` + wiring. No screen/component/style/router changes, ever.
- Clock = `components/Dial/`, shown in Home/CompanyHome/YearView/Panel exactly as the team built it. No activities UI (licence activities stay a passthrough array — still being figured out).
- Add-company form = team's `CompanyForm.tsx` fields exactly (kind, authority search, legal form, licence number + identity passthrough). Add nothing, remove nothing.
- Access grants storage already real. 2FA is mock placeholders and invite sending doesn't exist — both are greenfield real work below.

## Build (meetings-finalized, NO doc scanning)

1. **2nd-company payment trigger (no gateway):** Solo + 1 company + add another → portal-themed popup: "Online payment opens soon — the payment gateway will appear here to unlock your second company." At every add-company entry. Solo = 1 company enforced; Trio/Enterprise stay "opens soon".
2. **Real 2-step verification:** TOTP enroll → QR + verify → enabled, plus change-password and sessions, inside the team's `me/Security` look. Supabase MFA, best UX, recovery path, no dead ends. Must actually gate sign-in — never a stored fake flag.
3. **Real invites + roles + access:** owner invites by email + role (Owner/Manager/Adviser) + companies → emailed invite → accept links/creates the account with the grant. Member list, change role, remove access, per-company notification toggles. Owner-only invites; single-use expiring tokens, accepted only by the invited email; no self-escalation; every change audited; RLS enforced. Design it like the team would have.
4. **Meeting leftovers, wired real on team screens as-is:** profile/billing/security completion; mainland → "coming soon" + waitlist entry; duplicate zone+licence → "already on Boasis, ask its owner to invite you" (reveal nothing); plan-limit message; onboarding steps per `Boasis-Onboarding-v2.pdf` §5 (skip/not-sure → tasks, resume anywhere, live dates, state+origin+date on values, source+grade on rules, expiry-after-issue, vault uploads ≤20MB typed by hand); reminders RECORDED per §7 (sending waits on SMTP).
5. **Clock:** Dial on real dates, exactly as the team displays it.

## Still OUT

Gateway (Ziina later), SMTP sending (records only), doc scanning, home/guide extensions (leave as built), countdown, orbit redesign, PDF §13 deferred items.

## Pins (same contracts, plus)

No service key in browser bundles; RLS everywhere; invite reuse/expiry/foreign-email and 2FA bypass and escalation attempts all tested and documented; HIBP; rate limits; no secrets in logs; `npm audit` clean. Then the usual: security pass, functional + edge cases, non-functional, visitor-side UX review per touched screen.

**Do §-Build in order (1→5) on real Supabase data behind the existing gate. Report per item: built, proof results, exact test clicks. Hold the senior bar throughout: if any shortcut would weaken security, data integrity, or UX, say so and do it properly instead.**

---
