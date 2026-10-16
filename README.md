# Boasis Portal

Self-service portal for founders and freelancers running 1–3 UAE free-zone companies.
**Know, Tell, Guide, Keep** — company file, reminders, guidance, vault.

Source specs (on `main` branch): `Boasis-Onboarding-v2.pdf`, `Portal_Tech_Stack.pdf`.

## Structure

| Path | What lives here |
|---|---|
| `apps/web` | Next.js 15 + TypeScript app (pages + API + server logic) |
| `supabase/migrations` | Database schema, RLS policies, seeds — the only way schema changes |
| `content/authorities` | Zone rules as versioned JSON (`index.json` + one file per zone). Rules live here, **never in code** |
| `content/schema` | JSON Schemas validating every content file |
| `scripts` | Content validator (runs in CI; a bad zone file blocks the build) |
| `docs` | Architecture, setup, phase plan, decision log |

## Quick start

```bash
cp .env.example apps/web/.env.local   # then paste your Supabase keys
npm install
npm run validate:content              # zone content must pass before anything else
npm run dev                           # http://localhost:3000
```

Full guide: [`docs/SETUP.md`](docs/SETUP.md).

## Hard limits (from the spec — non-negotiable in code)

1. The portal never submits anything to government or a zone.
2. The portal never shows or calculates fine amounts — words + source only.
3. The portal never guesses — unsourced rules render as "unknown" + who can answer.

## Current phase

**Phase 1 — Price-based access:** account + plans + payment gate + entitlements.
See [`docs/PHASE1_PLAN.md`](docs/PHASE1_PLAN.md).
