import type { NextConfig } from 'next';

/**
 * Served with a standard `next start` (Railway today, any VPS tomorrow).
 * No `output: "standalone"`: built from the npm-workspace root it produced an
 * image without node_modules and crashed on boot. The Dockerfile installs
 * production dependencies instead.
 *
 * Serving shape:
 *   /                 the entry flow (this app)
 *   /portal, /portal/* the team's portal bundle, copied into public/portal at
 *                      image build time, gated by middleware (its ONLY gate:
 *                      static files never run page code)
 */
const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  rewrites() {
    // Next types these as promise-returning; returning a resolved promise
    // keeps the config honest without an async body that nothing awaits.
    return Promise.resolve([
      // The portal is a static SPA. Serve its index for the bare /portal path
      // (and any client-side deep link) so the router owns the rest.
      { source: '/portal', destination: '/portal/index.html' },
      { source: '/portal/', destination: '/portal/index.html' },
    ]);
  },
  headers() {
    return Promise.resolve([
      {
        // The portal shell must never be cached by a shared cache: it is
        // behind the gate and every asset next to it is content-hashed.
        source: '/portal',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        source: '/portal/index.html',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store, max-age=0' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        source: '/portal/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
      {
        // Entry and API responses are per-visitor and per-session.
        source: '/((?!portal).*)',
        headers: [{ key: 'Cache-Control', value: 'private, no-store, max-age=0' }],
      },
    ]);
  },
};

export default nextConfig;
