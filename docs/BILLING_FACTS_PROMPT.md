# BILLING FACTS FIX — continuation (paste into the SAME session on `arena/32c63c62-boasis-por`)

---

Act as a senior expert-level full-stack developer, security owner, and designer: security from every side, flag better long-term approaches, best-in-class UX, deliver exactly what is asked.

Same branch, next fix. The Billing screen shows "Standard — Free trial, 14 days, no card required." That line is the team's hardcoded `PLAN.trialDays` + copy string, kept verbatim under the keep-exact rule — but it is FACTUALLY wrong for this product. Rule clarification, apply everywhere: **keep-exact covers layout, theme, and concept — never wrong facts. Facts always come from the docs + meetings (meetings first on conflict).**

## Fix

1. **Billing shows the REAL subscription:** actual plan (Solo/Trio/Enterprise, never "Standard"), the free-year end date, and a live remaining countdown in months + days until the free year ends ("8 months, 12 days left"), plus one plain line on what happens after (continues at AED 30/month, reminders before anything is charged). Same screen, same theme — only the facts become real and live.
2. **Sweep every tiny detail:** audit the whole portal for hardcoded team facts that contradict the docs/meetings — trial lengths, plan names, prices, company limits, quota numbers, reminder copy, any "14 days"/"Standard"-style leftovers — and correct EACH to real subscription/plan data. Real data only; honest empty states where nothing exists yet; never demo values.
3. **Plans reminder (source of truth):** Solo = 1 company, free 12 months, no card, then AED 30/month. Trio = up to 3 companies, AED 90/month, opens with the gateway. Enterprise = custom via contact. First company free year for everyone including early access.

Same proof bar: tests + real runs, security clean, visitor-side UX review of the touched screens. Report per fix: what was hardcoded, what it shows now and where the value comes from, and the exact test clicks. Hold the senior bar throughout: if any shortcut would weaken security, data integrity, or UX, say so and do it properly instead.

---
