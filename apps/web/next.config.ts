import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean standalone server for Docker (Railway now, VPS later).
  output: "standalone",
  // Keep standalone flat (server.js at root) despite the npm-workspace root.
  outputFileTracingRoot: path.join(process.cwd()),
  // Keep default runtime (Node.js). No experimental flags in Phase 1.
};

export default nextConfig;
