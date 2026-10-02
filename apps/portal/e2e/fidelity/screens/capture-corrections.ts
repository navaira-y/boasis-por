// Side-by-side fidelity captures for the CEO's corrections: the home, the profile panel and
// page, the office tab and the sign-in screen, boasis-lite on the left where it has the
// screen, the portal on the right, at 390 and 1200, light and dark. Not a test; run by hand
// when both servers are up:
//
//   node --experimental-strip-types apps/portal/e2e/fidelity/screens/capture-corrections.ts
//
// LITE_URL and PORTAL_URL override the defaults. Uses the installed Google Chrome; no download.
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Theme = 'light' | 'dark';
type Width = 390 | 1200;

const OUT = dirname(fileURLToPath(import.meta.url));
const LITE_URL = process.env.LITE_URL ?? 'http://localhost:5180';
const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:5196';
const HEIGHT = 844;

const DEMO_SESSION = {
  email: 'owner@example.com',
  firstName: 'Layla',
  lastName: 'Haddad',
  phone: '',
  timeZone: 'Asia/Dubai',
  notificationEmail: '',
};

async function context(browser: Browser, theme: Theme, width: Width): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
}

async function liteGate(browser: Browser, theme: Theme, width: Width): Promise<Page> {
  const ctx = await context(browser, theme, width);
  await ctx.addInitScript((chosen: Theme) => {
    localStorage.setItem('boasis.theme', chosen);
  }, theme);
  const page = await ctx.newPage();
  await page.goto(LITE_URL);
  await page.locator('#email').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  return page;
}

async function liteSignedIn(page: Page): Promise<void> {
  await page.locator('#email').fill('fidelity@example.com');
  await page.locator('input[type="password"]').first().fill('Fidelity!1234');
  await page.locator('button.primary[type="submit"]').click();
  await page.locator('.ring').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
}

async function portalPage(
  browser: Browser,
  theme: Theme,
  width: Width,
  signedIn: boolean,
): Promise<Page> {
  const ctx = await context(browser, theme, width);
  if (signedIn) {
    await ctx.addInitScript((session: string) => {
      localStorage.setItem('boasis.portal.session', session);
    }, JSON.stringify(DEMO_SESSION));
  }
  const page = await ctx.newPage();
  return page;
}

async function compose(
  browser: Browser,
  name: string,
  theme: Theme,
  width: Width,
  left: Buffer | null,
  right: Buffer,
): Promise<void> {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const bg = theme === 'dark' ? '#0b1420' : '#f6f8fb';
  const ink = theme === 'dark' ? '#e4eef9' : '#16243a';
  const image = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
  const lite =
    left === null
      ? ''
      : `<figure><figcaption>boasis-lite</figcaption><img src="${image(left)}"></figure>`;
  await page.setContent(
    `<style>
      body{margin:0;background:${bg};color:${ink};font:600 14px/1 Poppins,Arial,sans-serif}
      main{display:inline-flex;gap:24px;padding:24px;align-items:flex-start}
      figure{margin:0;display:flex;flex-direction:column;gap:8px}
      img{display:block;width:${String(width)}px;height:auto;border-radius:12px;box-shadow:0 10px 30px -20px rgba(0,0,0,.5)}
    </style>
    <main>
      ${lite}
      <figure><figcaption>portal</figcaption><img src="${image(right)}"></figure>
    </main>`,
  );
  const buffer = await page.locator('main').screenshot();
  const file = `${name}-${theme}-${String(width)}.png`;
  await writeFile(join(OUT, file), buffer);
  await ctx.close();
  console.log(`wrote ${file}`);
}

async function captureSet(browser: Browser, theme: Theme, width: Width): Promise<void> {
  const phone = width === 390;

  // Sign in: lite's gate beside the portal's.
  const lite = await liteGate(browser, theme, width);
  const gate = await portalPage(browser, theme, width, false);
  await gate.goto(`${PORTAL_URL}/#/auth`);
  await gate.locator('.gate').waitFor({ timeout: 20_000 });
  await gate.waitForTimeout(600);
  await compose(browser, 'auth', theme, width, await lite.screenshot(), await gate.screenshot());
  await gate.context().close();

  // Home.
  await liteSignedIn(lite);
  const portal = await portalPage(browser, theme, width, true);
  await portal.goto(`${PORTAL_URL}/#/`);
  await portal.locator('.dial').first().waitFor({ timeout: 20_000 });
  await portal.waitForTimeout(800);
  await compose(browser, 'home', theme, width, await lite.screenshot(), await portal.screenshot());

  // The profile panel: lite's account page beside the panel opened from the avatar.
  await lite.locator('.hdr .me').click();
  await lite.locator('.acct').waitFor();
  await lite.waitForTimeout(400);
  const liteAccount = await lite.screenshot();
  await portal.getByRole('button', { name: 'Your account' }).click();
  await portal
    .locator(phone ? '.sheet-layer--on .sheet' : '[data-testid="profile-panel"]')
    .waitFor();
  await portal.waitForTimeout(400);
  await compose(browser, 'profile-panel', theme, width, liteAccount, await portal.screenshot());

  // The profile page.
  await portal.goto(`${PORTAL_URL}/#/me/profile`);
  await portal.locator('.pg.acct').waitFor();
  await portal.waitForTimeout(400);
  await compose(browser, 'profile-page', theme, width, liteAccount, await portal.screenshot());

  // The office tab: the portal only, lite has no equivalent.
  await portal.goto(`${PORTAL_URL}/#/companies/co-demo-noor/offices`);
  await portal.locator('.offices').waitFor();
  await portal.waitForTimeout(400);
  await compose(browser, 'office', theme, width, null, await portal.screenshot());

  await lite.context().close();
  await portal.context().close();
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const width of [390, 1200] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await captureSet(browser, theme, width);
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
