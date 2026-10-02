import { defineConfig } from '@playwright/test';

// The dev server's address; PORTAL_URL points the tests at one already running elsewhere.
const baseURL = process.env.PORTAL_URL ?? 'http://localhost:5190';

// The demo owner the mock signs in as; the same shape as src/lib/session.ts.
const DEMO_SESSION = {
  email: 'owner@example.com',
  firstName: 'Layla',
  lastName: 'Haddad',
  phone: '',
  timeZone: 'Asia/Dubai',
  notificationEmail: '',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // The installed Google Chrome, so no browser download is ever needed (used by the fidelity
  // captures in e2e/fidelity as well).
  use: {
    baseURL,
    channel: 'chrome',
    // A signed-in session in storage, so every test lands on the app rather than the gate.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: 'boasis.portal.session', value: JSON.stringify(DEMO_SESSION) }],
        },
      ],
    },
  },
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
