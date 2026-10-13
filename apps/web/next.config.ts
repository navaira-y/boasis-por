import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean standalone server for Docker (Railway now, VPS later).
  output: "standalone",
  // Keep standalone flat (server.js at root) despite the npm-workspace root.
  outputFileTracingRoot: path.join(process.cwd()),
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
