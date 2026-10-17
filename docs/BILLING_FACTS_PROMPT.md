# PLANS FACTS SWEEP — continuation (paste into the SAME session on `arena/32c63c62-boasis-por`)

---

Act as a senior expert-level full-stack developer, security owner, and designer: security from every side, flag better long-term approaches, best-in-class UX, deliver exactly what is asked.

Same branch, next fix. The Billing screen shows "Standard — Free trial, 14 days" — the team's hardcoded `PLAN.trialDays` + copy string, kept verbatim under keep-exact. Rule clarification, apply EVERYWHERE: **keep-exact covers layout, theme, and concept — never wrong facts. Facts always come from the docs + meetings, meetings first on conflict.**

## Current plans (source of truth — the PDF is outdated here)

- **Solo** — 1 company. FREE for 12 months, no card. Then AED 30/month. This is the only live plan.
- **Trio** — up to 3 companies. AED 90/month. Opens with the payment gateway ("opens soon" until then).
- **Enterprise** — custom companies, custom price, via contact us.
- **Early access** — waitlist emails enter free, Solo-level, no payment, no plan choice.
- Triggers: card/payment is asked ONLY at the 2nd company or when the free year ends. No payment before verification, ever.

## What changed vs `Boasis-Onboarding-v2.pdf` (do NOT follow the PDF on these)

1. PDF: "1 company AED 30 a month" from day one → NOW: first year FREE, then AED 30.
2. PDF: no plan names → NOW: Solo / Trio / Enterprise (never "Standard", never unnamed).
3. PDF: charge at signup or step 8 → NOW: no card at the door at all; 2nd-company + expiry triggers only.
4. PDF: no early access → NOW: waitlist door exists and is free.
5. Team code: "Free trial, 14 days" → NOW: 12-month free year with a live months+days countdown.

## Sweep (the whole product, not just Billing)

Audit every user-visible fact in portal + web app — screens, copy files, plan names, prices, limits, trial copy, Billing (must show the REAL subscription: actual plan, free-year end date, live months+days remaining, one plain line on what happens after), paywalls/popups, notices, reminder copy — and correct EACH stale value to real subscription/plan data. Same screens, same theme — only facts become real and live. Real data only; honest empty states; never demo values. If any PDF paragraph contradicts the list above, the list above wins — note each such override in your report.

## Header countdown (upper right corner, all plans and states)

Add a small countdown chip in the portal header's upper right (inside the team's chrome, matching its theme exactly — additive element, no redesign): time left until the CURRENT period ends, from the real subscription (`current_period_end`, Asia/Dubai days).
- Free year: months + days ("8 months, 12 days left") — same value as the Billing countdown.
- Paid monthly period (e.g. Solo year 2): days only ("23 days left").
- Trio/Enterprise: same rule by their own period (days only for monthly periods).
- 7 days or less left: warn state within the existing theme (no new palette, no redesign).
- Expired / past_due: "Plan ended — renew to unlock", linking to billing.
- Never a hardcoded number; recompute from the subscription on load and at day rollover. No subscription row yet: show nothing, never a placeholder.

Same proof bar: tests + real runs, security clean, visitor-side UX review of touched screens. Report per fix: where, what it said, what it says now, where the value comes from. Hold the senior bar throughout: if any shortcut would weaken security, data integrity, or UX, say so and do it properly instead.

---
