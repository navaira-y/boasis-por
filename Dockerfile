# Boasis: portal (Vite) + web (Next.js) in one image, served same-origin.
# Build context: REPO ROOT (Railway Root Directory must be empty = repo root).
# The portal builds with VITE_DATA_MODE=supabase and its static output is
# copied into the web app's public/portal, so /portal/* shares the web app's
# origin, login cookies and middleware pay gate. Same image runs on Railway
# today and on any VPS tomorrow.
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Build-time public env (Railway passes service variables as build args).
# *_PUBLIC_* values are inlined into client bundles at build time, so they
# must exist here. The portal reuses the SAME Supabase values (mapped to the
# VITE_* names Vite requires) — no extra variables to set. Server-only
# secrets stay runtime-only and are NEVER baked into the image.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
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
ENV VITE_DATA_MODE=supabase \
    VITE_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @boasis/portal
# Portal static output becomes same-origin /portal/* behind the pay gate.
RUN rm -rf apps/web/public/portal \
  && mkdir -p apps/web/public/portal \
  && cp -r apps/portal/dist/* apps/web/public/portal/
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
RUN npm run build --workspace @boasis/web

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"
# Force port 3000: platforms inject their own PORT at runtime, which would
# silently move the app away from the domain's target port (3000).
CMD ["sh", "-c", "PORT=3000 node server.js"]
