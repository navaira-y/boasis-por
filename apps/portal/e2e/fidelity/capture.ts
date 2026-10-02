// Side-by-side fidelity captures: boasis-lite on the left, the portal gallery on the right, at a
// 390px phone width, light and dark. Not a test; run by hand when both servers are up:
//
//   node --experimental-strip-types apps/portal/e2e/fidelity/capture.ts
//
// LITE_URL and PORTAL_URL override the defaults. LITE_STATE points at a JSON file with the
// preview session and database of a signed-in lite (read from a browser's localStorage), so the
// script never types a password. Uses the installed Google Chrome; no browser download.
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Theme = 'light' | 'dark';

interface LiteState {
  readonly session: string;
  readonly db: string;
}

const OUT = dirname(fileURLToPath(import.meta.url));
const LITE_URL = process.env.LITE_URL ?? 'http://localhost:5180';
const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:5195';
const VIEWPORT = { width: 390, height: 844 };

async function readLiteState(): Promise<LiteState | null> {
  const path = process.env.LITE_STATE;
  if (path === undefined) {
    return null;
  }
  const raw = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'session' in parsed &&
    'db' in parsed &&
    typeof parsed.session === 'string' &&
    typeof parsed.db === 'string'
  ) {
    return { session: parsed.session, db: parsed.db };
  }
  throw new Error('LITE_STATE must be {"session": string, "db": string}');
}

async function context(browser: Browser, theme: Theme): Promise<BrowserContext> {
  return browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2, colorScheme: theme });
}

async function litePage(browser: Browser, theme: Theme, state: LiteState | null): Promise<Page> {
  const ctx = await context(browser, theme);
  await ctx.addInitScript(
    ({ chosen, seed }: { chosen: Theme; seed: LiteState | null }) => {
      localStorage.setItem('boasis.theme', chosen);
      if (seed !== null) {
        localStorage.setItem('boasis.preview.session', seed.session);
        localStorage.setItem('boasis.preview.db', seed.db);
      }
    },
    { chosen: theme, seed: state },
  );
  const page = await ctx.newPage();
  await page.goto(LITE_URL);
  await page.locator('.ring').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  return page;
}

async function portalPage(browser: Browser, theme: Theme): Promise<Page> {
  const ctx = await context(browser, theme);
  const page = await ctx.newPage();
  await page.goto(`${PORTAL_URL}/#/dev/gallery`);
  await page.getByRole('tab', { name: theme === 'dark' ? 'Dark' : 'Light' }).click();
  await page.locator('.dial').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(600);
  return page;
}

// The first few elements matching a selector, each as its own image; compose stacks them.
async function eachOf(page: Page, selector: string, count: number): Promise<Buffer[]> {
  const images: Buffer[] = [];
  const total = await page.locator(selector).count();
  for (let index = 0; index < Math.min(count, total); index += 1) {
    images.push(await page.locator(selector).nth(index).screenshot());
  }
  if (images.length === 0) {
    throw new Error(`nothing matched ${selector}`);
  }
  return images;
}

async function compose(
  browser: Browser,
  name: string,
  theme: Theme,
  left: Buffer | Buffer[],
  right: Buffer | Buffer[],
): Promise<void> {
  const ctx = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const bg = theme === 'dark' ? '#0b1420' : '#f6f8fb';
  const ink = theme === 'dark' ? '#e4eef9' : '#16243a';
  const image = (buffer: Buffer) => `data:image/png;base64,${buffer.toString('base64')}`;
  const stack = (side: Buffer | Buffer[]) =>
    (Array.isArray(side) ? side : [side]).map((buffer) => `<img src="${image(buffer)}">`).join('');
  await page.setContent(
    `<style>
      body{margin:0;background:${bg};color:${ink};font:600 14px/1 Poppins,Arial,sans-serif}
      main{display:inline-flex;gap:24px;padding:24px;align-items:flex-start}
      figure{margin:0;display:flex;flex-direction:column;gap:8px}
      img{display:block;width:390px;height:auto;border-radius:12px;box-shadow:0 10px 30px -20px rgba(0,0,0,.5)}
    </style>
    <main>
      <figure><figcaption>boasis-lite</figcaption>${stack(left)}</figure>
      <figure><figcaption>portal gallery</figcaption>${stack(right)}</figure>
    </main>`,
  );
  const buffer = await page.locator('main').screenshot();
  await writeFile(join(OUT, `${name}-${theme}.png`), buffer);
  await ctx.close();
  console.log(`wrote ${name}-${theme}.png`);
}

async function captureTheme(
  browser: Browser,
  theme: Theme,
  state: LiteState | null,
): Promise<void> {
  const lite = await litePage(browser, theme, state);
  const portal = await portalPage(browser, theme);

  // The dial.
  const liteDial = await lite.locator('.year').first().screenshot();
  const portalDial = await portal.locator('.hero').first().screenshot();
  await compose(browser, 'dial', theme, liteDial, portalDial);

  // A row list.
  const liteRows = await eachOf(lite, '.row', 3);
  const portalRows = await portal.locator('.gallery__list').screenshot();
  await compose(browser, 'rows', theme, liteRows, portalRows);

  // The sheet: lite opens a deadline; the gallery opens its demo sheet.
  await lite.locator('.row').first().click();
  await lite.locator('.sheet.on').waitFor();
  await lite.waitForTimeout(400);
  const liteSheet = await lite.screenshot();
  await lite.locator('.shut').click();
  await lite.waitForTimeout(300);
  await portal.getByRole('button', { name: 'Open a sheet' }).click();
  await portal.locator('.sheet-layer--on .sheet').first().waitFor();
  await portal.waitForTimeout(400);
  const portalSheet = await portal.screenshot();
  await compose(browser, 'sheet', theme, liteSheet, portalSheet);

  // The picker: the gallery's sheet holds one; lite's add-company sheet holds one.
  await portal.locator('#gallery-sheet-zone').click();
  await portal.locator('.sheet-layer--on .picker__list').first().waitFor();
  await portal.waitForTimeout(400);
  const portalPicker = await portal.screenshot();
  await portal.keyboard.press('Escape');
  await portal.waitForTimeout(200);
  await portal.keyboard.press('Escape');
  await lite.locator('.botnav button').nth(1).click();
  await lite.locator('.cocard').first().waitFor();
  const liteCards = await eachOf(lite, '.cocard', 3);
  await lite.locator('.add').first().click();
  await lite.locator('.sheet.on').waitFor();
  await lite.getByRole('button', { name: /Type it in/ }).click();
  await lite.locator('.sheet.on .pick2 .cur').first().waitFor();
  await lite.waitForTimeout(400);
  await lite.locator('.sheet.on .pick2 .cur').first().click();
  await lite.locator('.pick2 .menu').waitFor();
  await lite.waitForTimeout(300);
  const litePicker = await lite.screenshot();
  await compose(browser, 'picker', theme, litePicker, portalPicker);

  // The card: lite's company card beside the spec 7.2 compliance card.
  const portalCards = await eachOf(portal, '.compliance-card', 3);
  await compose(browser, 'card', theme, liteCards, portalCards);

  await lite.context().close();
  await portal.context().close();
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const state = await readLiteState();
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    await captureTheme(browser, 'light', state);
    await captureTheme(browser, 'dark', state);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
