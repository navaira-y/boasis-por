# Boasis: the team's portal (Vite) and the entry app (Next.js) in one image,
# served same-origin so /portal/* shares the entry app's cookies and gate.
# Build context: REPO ROOT (Railway Root Directory must be empty).
#
# Two rules the layout depends on:
#   1. The portal bundle inlines its Supabase settings at BUILD time. That is
#      correct for an anon key (it is public by design and RLS protects it) and
#      the values are reused from the existing NEXT_PUBLIC_* variables, so no
#      extra Railway variable is needed.
#   2. The entry app reads its settings at RUNTIME (computed env lookups), so
#      no secret, and no stale value, is ever baked into this image. The
#      service key lives only in Railway's variables.
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
COPY package.json package-lock.json ./
COPY apps/portal/package.json apps/portal/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/assistant/package.json packages/assistant/package.json
COPY packages/content/package.json packages/content/package.json
COPY packages/rules/package.json packages/rules/package.json
COPY packages/schema/package.json packages/schema/package.json
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN VITE_DATA_MODE=supabase \
    VITE_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    npm run build --workspace @boasis/portal
# The portal becomes same-origin /portal/* behind the gate. It is built here,
# never committed (see .gitignore).
RUN node --experimental-strip-types apps/web/scripts/prepare-portal.ts
RUN npm run build --workspace @boasis/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
# Production-only install at the workspace root, then the prebuilt app. No dev
# dependencies, no source, no secrets in the image.
COPY package.json package-lock.json ./
COPY apps/portal/package.json apps/portal/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/assistant/package.json packages/assistant/package.json
COPY packages/content/package.json packages/content/package.json
COPY packages/rules/package.json packages/rules/package.json
COPY packages/schema/package.json packages/schema/package.json
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
# Standard runner on purpose: `output: "standalone"` built from the workspace
# root produced an image without node_modules and crashed on boot.
CMD ["./node_modules/.bin/next", "start", "apps/web", "-p", "3000"]
