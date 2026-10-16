import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests for the entry layer: pure functions, the env/key diagnostics, and
// the entry decision table. Flow-level proof lives in test/e2e (a real build,
// a real `next start`, against the local fake Supabase in test/harness).
export default defineConfig({
  test: {
    name: 'web',
    environment: 'node',
    include: ['lib/**/*.test.ts', 'test/**/*.test.ts'],
    // The integration test drives a real HTTP endpoint, and the Supabase client
    // retries a 503 three times with backoff before it gives up. That is the
    // behaviour a broken database really produces, so the budget allows for it.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      // Next resolves "server-only" to its empty react-server entry; plain
      // Node would load the marker that throws. Tests use the empty stand-in
      // so server modules can be imported and unit tested.
      'server-only': fileURLToPath(new URL('./test/stubs/server-only.ts', import.meta.url)),
    },
  },
});
