// Side-by-side fidelity captures of the ported screens: boasis-lite on the left, the portal on
// the right, at a 390px phone width, light and dark. Not a test; run by hand when both servers
// are up:
//
//   node --experimental-strip-types apps/portal/e2e/fidelity/screens.ts
//
// LITE_URL and PORTAL_URL override the defaults. Lite's preview stand-in signs in with any email
// and password, and the portal's mock does the same, so no real credential is typed. Uses the
// installed Google Chrome; no browser download.
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Theme = 'light' | 'dark';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'screens');
const LITE_URL = process.env.LITE_URL ?? 'http://localhost:5180';
const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:5197';
const VIEWPORT = { width: 390, height: 844 };
const COMPANY = 'co-demo-noor';
const PERSON = 'pe-demo-amina';

const PORTAL_SESSION = {
  email: 'owner@example.com',
  firstName: 'Layla',
  lastName: 'Haddad',
  phone: '',
  timeZone: 'Asia/Dubai',
  notificationEmail: '',
};

async function context(browser: Browser, theme: Theme): Promise<BrowserContext> {
  return browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: theme });
}

async function litePage(browser: Browser, theme: Theme): Promise<Page> {
  const ctx = await context(browser, theme);
  await ctx.addInitScript((chosen: Theme) => {
    localStorage.setItem('boasis.theme', chosen);
  }, theme);
  const page = await ctx.newPage();
  await page.goto(LITE_URL);
  const gate = page.locator('.gate');
  if (await gate.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.locator('#email').fill('demo@boasis-lite.demo');
    await page.locator('#password').fill('preview-only');
    await page.locator('button.primary').click();
  }
  await page.locator('.ring').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  return page;
}

async function portalPage(browser: Browser, theme: Theme): Promise<Page> {
  const ctx = await context(browser, theme);
  await ctx.addInitScript(
    ({ chosen, session }: { chosen: Theme; session: typeof PORTAL_SESSION }) => {
      localStorage.setItem('boasis.theme', chosen);
      localStorage.setItem('boasis.portal.session', JSON.stringify(session));
      document.documentElement.setAttribute('data-theme', chosen);
    },
    { chosen: theme, session: PORTAL_SESSION },
  );
  const page = await ctx.newPage();
  await page.goto(`${PORTAL_URL}/#/`);
  await page.getByRole('heading', { name: 'My companies' }).waitFor({ timeout: 15_000 });
  return page;
}

async function portalAt(page: Page, hash: string, ready: string): Promise<Buffer> {
  await page.evaluate((next: string) => {
    location.hash = next;
  }, hash);
  await page.locator(ready).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  return page.screenshot({ fullPage: true });
}

async function liteTab(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).first().click();
  await page.waitForTimeout(500);
}

async function compose(
  browser: Browser,
  name: string,
  theme: Theme,
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
      img{display:block;width:390px;height:auto;border-radius:12px;box-shadow:0 10px 30px -20px rgba(0,0,0,.5)}
    </style>
    <main>
      <figure><figcaption>boasis-lite</figcaption><img src="${image(left)}"></figure>
      <figure><figcaption>portal</figcaption><img src="${image(right)}"></figure>
    </main>`,
  );
  const buffer = await page.locator('main').screenshot();
  await writeFile(join(OUT, `${name}-${theme}.png`), buffer);
  await ctx.close();
  console.log(`wrote ${name}-${theme}.png`);
}

async function captureTheme(browser: Browser, theme: Theme): Promise<void> {
  const lite = await litePage(browser, theme);
  const portal = await portalPage(browser, theme);

  // People: lite's Visas tab of the first company.
  await lite.locator('.botnav button').nth(1).click();
  await lite.locator('.cocard').first().waitFor();
  await lite.locator('.cocard .open').first().click();
  await liteTab(lite, 'Visas');
  const litePeople = await lite.screenshot({ fullPage: true });
  const portalPeople = await portalAt(portal, `#/companies/${COMPANY}/people`, '.visa');
  await compose(browser, 'people', theme, litePeople, portalPeople);

  // Person: lite opens the visa sheet from the line.
  await lite.locator('.visa .open').first().click();
  await lite.locator('.sheet.on').waitFor();
  await lite.waitForTimeout(400);
  const litePerson = await lite.screenshot();
  await lite.locator('.shut').click();
  await lite.waitForTimeout(300);
  const portalPerson = await portalAt(
    portal,
    `#/companies/${COMPANY}/people/${PERSON}`,
    '.person .sh',
  );
  await compose(browser, 'person', theme, litePerson, portalPerson);

  // Documents.
  await liteTab(lite, 'Documents');
  const liteDocs = await lite.screenshot({ fullPage: true });
  const portalDocs = await portalAt(
    portal,
    `#/companies/${COMPANY}/documents`,
    '.documents .vhead',
  );
  await compose(browser, 'documents', theme, liteDocs, portalDocs);

  // Settings: lite's Renewals tab is the source of the rows.
  await liteTab(lite, 'Renewals');
  const liteSettings = await lite.screenshot({ fullPage: true });
  const portalSettings = await portalAt(portal, '#/settings/reminders', '.settings .rule');
  await compose(browser, 'settings', theme, liteSettings, portalSettings);

  // Library: lite's Guides tab.
  await lite.locator('.botnav button').nth(3).click();
  await lite.locator('.libcard').first().waitFor();
  await lite.waitForTimeout(600);
  const liteLibrary = await lite.screenshot({ fullPage: true });
  const portalLibrary = await portalAt(portal, '#/library', '.libcard');
  await compose(browser, 'library', theme, liteLibrary, portalLibrary);

  // Access.
  await lite.locator('.botnav button').nth(2).click();
  await lite.locator('.acc').first().waitFor();
  await lite.waitForTimeout(600);
  const liteAccess = await lite.screenshot({ fullPage: true });
  const portalAccess = await portalAt(portal, '#/settings/access', '.acc .plist, .acc .atable');
  await compose(browser, 'access', theme, liteAccess, portalAccess);

  // Account.
  await lite.locator('.hdr .me').click();
  await lite.locator('.acct').first().waitFor();
  await lite.waitForTimeout(400);
  const liteAccount = await lite.screenshot({ fullPage: true });
  const portalAccount = await portalAt(portal, '#/settings/account', '.acct .abox');
  await compose(browser, 'account', theme, liteAccount, portalAccount);

  await lite.context().close();
  await portal.context().close();
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    await captureTheme(browser, 'light');
    await captureTheme(browser, 'dark');
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
