// Side-by-side fidelity captures of the ported screens: boasis-lite on the left, the portal on
// the right, at a 390px phone width and at 1200px, light and dark. Not a test; run by hand when
// both servers are up:
//
//   node --experimental-strip-types apps/portal/e2e/fidelity/screens/capture.ts
//
// LITE_URL and PORTAL_URL override the defaults. Lite's preview signs in with any email and
// password, so the script signs in itself. Uses the installed Google Chrome; no download.
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

async function context(browser: Browser, theme: Theme, width: Width): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width, height: HEIGHT },
    deviceScaleFactor: 2,
    colorScheme: theme,
    reducedMotion: 'reduce',
  });
}

async function litePage(browser: Browser, theme: Theme, width: Width): Promise<Page> {
  const ctx = await context(browser, theme, width);
  await ctx.addInitScript((chosen: Theme) => {
    localStorage.setItem('boasis.theme', chosen);
  }, theme);
  const page = await ctx.newPage();
  await page.goto(LITE_URL);
  // The gate, unless a session is already stored.
  const email = page.locator('#email');
  if (await email.isVisible({ timeout: 3000 }).catch(() => false)) {
    await email.fill('fidelity@example.com');
    await page.locator('input[type="password"]').first().fill('Fidelity!1234');
    await page.locator('button.primary[type="submit"]').click();
  }
  await page.locator('.ring').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  return page;
}

// The cross in the corner, then the layer gone: a key press depends on where the focus is.
async function closePortalSheet(portal: Page): Promise<void> {
  await portal.locator('.sheet-layer--on .sheet__close').first().click();
  await portal
    .locator('.sheet-layer--on')
    .waitFor({ state: 'detached', timeout: 5000 })
    .catch(() => undefined);
  await portal.waitForTimeout(400);
}

// The demo owner the mock signs in as (the shape of src/lib/session.ts).
const DEMO_SESSION = {
  email: 'owner@example.com',
  firstName: 'Layla',
  lastName: 'Haddad',
  phone: '',
  timeZone: 'Asia/Dubai',
  notificationEmail: '',
};

async function portalPage(browser: Browser, theme: Theme, width: Width): Promise<Page> {
  const ctx = await context(browser, theme, width);
  await ctx.addInitScript((session: string) => {
    localStorage.setItem('boasis.portal.session', session);
  }, JSON.stringify(DEMO_SESSION));
  const page = await ctx.newPage();
  await page.goto(`${PORTAL_URL}/#/`);
  await page.locator('.dial').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  return page;
}

async function compose(
  browser: Browser,
  name: string,
  theme: Theme,
  width: Width,
  left: Buffer,
  right: Buffer,
): Promise<void> {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const bg = theme === 'dark' ? '#0b1420' : '#f6f8fb';
  const ink = theme === 'dark' ? '#e4eef9' : '#16243a';
  const image = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
  await page.setContent(
    `<style>
      body{margin:0;background:${bg};color:${ink};font:600 14px/1 Poppins,Arial,sans-serif}
      main{display:inline-flex;gap:24px;padding:24px;align-items:flex-start}
      figure{margin:0;display:flex;flex-direction:column;gap:8px}
      img{display:block;width:${String(width)}px;height:auto;border-radius:12px;box-shadow:0 10px 30px -20px rgba(0,0,0,.5)}
    </style>
    <main>
      <figure><figcaption>boasis-lite</figcaption><img src="${image(left)}"></figure>
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
  const lite = await litePage(browser, theme, width);
  const portal = await portalPage(browser, theme, width);
  const phone = width === 390;

  // Home.
  await compose(browser, 'home', theme, width, await lite.screenshot(), await portal.screenshot());

  // The deadline sheet: lite opens its first row; the portal opens the first upcoming row.
  await lite.locator('.row').first().click();
  await lite.locator('.sheet.on').waitFor();
  await lite.waitForTimeout(400);
  const liteDeadline = await lite.screenshot();
  await lite.locator('.shut').click();
  await lite.waitForTimeout(300);
  await portal.locator('.hpanel__row').first().click();
  await portal.locator('.sheet-layer--on .sheet').first().waitFor();
  await portal.waitForTimeout(400);
  const portalDeadline = await portal.screenshot();
  await closePortalSheet(portal);
  await compose(browser, 'deadline-sheet', theme, width, liteDeadline, portalDeadline);

  // The company page: lite's Companies tab, first company; the portal's first company card.
  await lite
    .locator(phone ? '.botnav button' : '.rail button')
    .nth(1)
    .click();
  await lite.locator('.cocard').first().waitFor();
  await lite.waitForTimeout(300);
  const liteCompanies = await lite.screenshot();
  await portal.goto(`${PORTAL_URL}/#/companies`);
  await portal.locator('.cocard').first().waitFor();
  await portal.waitForTimeout(400);
  await compose(browser, 'companies', theme, width, liteCompanies, await portal.screenshot());

  // The company sheet: lite's add company, typed in; the portal's add company.
  await lite.locator('.add').first().click();
  await lite.locator('.sheet.on').waitFor();
  await lite.getByRole('button', { name: /Type it in/ }).click();
  await lite.locator('.sheet.on .form').waitFor();
  await lite.waitForTimeout(400);
  const liteCompanySheet = await lite.screenshot();
  await lite.locator('.shut').click();
  await lite.waitForTimeout(300);
  await portal.locator('.add').first().click();
  await portal.locator('.sheet-layer--on .sheet').first().waitFor();
  await portal.getByRole('button', { name: /Type it in/ }).click();
  await portal.locator('.sheet-layer--on .form').waitFor();
  await portal.waitForTimeout(400);
  await compose(
    browser,
    'company-sheet',
    theme,
    width,
    liteCompanySheet,
    await portal.screenshot(),
  );
  await closePortalSheet(portal);

  // Inside a company: lite's first company; the portal's demo company.
  await lite.locator('.cocard .open').first().click();
  await lite.locator('.co .cotabs').waitFor();
  await lite.waitForTimeout(500);
  const liteCompany = await lite.screenshot();
  await portal.locator('.cocard__open').first().click();
  await portal.locator('.cotabs').waitFor();
  await portal.waitForTimeout(500);
  await compose(browser, 'company', theme, width, liteCompany, await portal.screenshot());

  // The documents and people tabs, hosted inside the company header.
  for (const [name, liteTab, portalTab] of [
    ['company-documents', 'Documents', 'Documents'],
    ['company-people', 'Visas', 'Visas'],
  ] as const) {
    await lite.locator('.cotabs button', { hasText: liteTab }).click();
    await lite.waitForTimeout(500);
    const liteShot = await lite.screenshot();
    await portal.locator('.cotabs a', { hasText: portalTab }).click();
    await portal.locator('.pg').waitFor();
    await portal.waitForTimeout(500);
    await compose(browser, name, theme, width, liteShot, await portal.screenshot());
  }
  await lite.locator('.cotabs button', { hasText: 'Dates' }).click();
  await portal.locator('.cotabs a', { hasText: 'Dates' }).click();
  await portal.waitForTimeout(300);

  // The year view: lite's home is its year page; the portal has a route for one company.
  await lite
    .locator(phone ? '.botnav button' : '.rail button')
    .nth(0)
    .click();
  await lite.locator('.ring').first().waitFor();
  await lite.waitForTimeout(500);
  const liteYear = await lite.locator('.year').first().screenshot();
  const companyUrl = portal.url();
  await portal.goto(`${companyUrl}/year`);
  await portal.locator('.year--full').waitFor();
  await portal.waitForTimeout(500);
  const portalYear = await portal.locator('.year--full').screenshot();
  await compose(browser, 'year', theme, width, liteYear, portalYear);

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
