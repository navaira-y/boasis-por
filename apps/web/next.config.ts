import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standard server build, run with `next start` in Docker (Railway now,
  // VPS later). Standalone output was dropped: built from the npm-workspace
  // root it shipped an image without node_modules and crashed on boot
  // (`Cannot find module 'next'`).
  // Keep default runtime (Node.js). No experimental flags in Phase 1.
  // Safe static-serving headers for the portal bundle (no inline-script
  // assumptions, so no CSP here — that needs per-page testing first).
  async headers() {
    return [
      {
        source: "/portal/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
