import { defineConfig } from 'vitest/config';

// Every workspace is a Vitest project; `npm run test` at the root runs them all.
export default defineConfig({
  test: {
    projects: [
      'packages/schema',
      'packages/rules',
      'packages/content',
      'packages/assistant',
      'apps/portal',
      'apps/server',
    ],
  },
});
