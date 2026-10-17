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

Same proof bar: tests + real runs, security clean, visitor-side UX review of touched screens. Report per fix: where, what it said, what it says now, where the value comes from. Hold the senior bar throughout: if any shortcut would weaken security, data integrity, or UX, say so and do it properly instead.

---
