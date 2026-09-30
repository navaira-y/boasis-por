# Deploy guide

## Path 1 — Railway (now: testing + launch)

1. Railway dashboard → New Project → Deploy from GitHub → select
   `navaira-y/boasis-por`, branch `arena/01a0ecee-boasis-por` (or `main` once merged).
2. Service settings → Root Directory: `apps/web` (build uses the Dockerfile).
3. Variables → add exactly these (same names as `.env.example`):
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (the Railway URL),
   `BILLING_PROVIDER=stub` (testing) or `stripe` + `STRIPE_SECRET_KEY` +
   `STRIPE_WEBHOOK_SECRET` (real payments).
4. Deploy → open the URL → walk `/signup?plan=solo`.
5. Trial = $5 credit (a few days of full-stack testing). Add a card to keep
   it running past the trial.

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
