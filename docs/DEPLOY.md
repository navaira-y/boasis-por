# Deploy guide

## Path 1 — Railway (client demo + launch)

1. Railway dashboard → New Project → Deploy from GitHub → select
   `navaira-y/boasis-por`, branch `arena/01a0ecee-boasis-por` (or `main` once merged).
2. Service settings → Root Directory: `apps/web` (build uses the Dockerfile).
3. Variables → add these (same names as `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` — deploy once, then set to the Railway URL and
     redeploy (checkout links + renewal emails use it)
   - `BILLING_PROVIDER=stub` + `DEMO_ALLOW_STUB=true` (client demo: fake
     checkout, no real money) — or `stripe` + `STRIPE_SECRET_KEY` +
     `STRIPE_WEBHOOK_SECRET` (real payments)
   - `CRON_SECRET` (long random string, e.g. `openssl rand -hex 32`)
   - `EMAIL_PROVIDER=log` (demo: reminders print to logs) — or `smtp` +
     `SMTP_USER` + `SMTP_PASS` (Google App Password, not login password) +
     `EMAIL_FROM=support@boasis.ae` (send via Google Workspace, same as boasis.ae)
4. Deploy → open the URL → walk `/signup` (plan is chosen at payment).
5. Daily renewals: add a free schedule at cron-job.org (or any scheduler):
   `GET https://<your-app>.up.railway.app/api/cron/renewals` once a day
   (~02:00 Dubai), header `Authorization: Bearer <CRON_SECRET>`.
6. Trial = $5 credit (a few days of full-stack testing). Add a card to keep
   it running past the trial.

Demo script (2 minutes): sign up with a real email → enter the 6-digit code
→ pick Trio → simulated checkout → portal opens. Solo shows the free-year
path; Enterprise shows the contact card.

## Path 2 — Hostinger VPS (later move; same containers)

Requires a **VPS (KVM)**, not shared web hosting — shared hosting cannot run
Redis/workers. One KVM 2 box is plenty (see client Q&A in chat history).

1. Provision KVM 2 (Ubuntu 24.04), point DNS `portal.boasis.ae` at its IP.
2. Install Docker: `curl -fsSL https://get.docker.com | sh`.
3. Copy the repo + env file, then (compose file ships with the Phase-2
   worker; until then the web container alone):
   `docker build -f apps/web/Dockerfile -t boasis-web apps/web && docker run ...`
4. Put Caddy in front for automatic HTTPS.
5. Move = an afternoon: same image, same env names, only the host changes.

## Never

- Shared-hosting "Node.js" for this stack (no Redis, workers killed, no root).
- Baking secrets into the image — env vars only, via the platform.
- `DEMO_ALLOW_STUB=true` on anything except the demo deploy.
