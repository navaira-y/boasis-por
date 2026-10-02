// Captures of the compliance screens (spec 14 screens 9 to 14): the board, a card page, the
// decision point, a tracker, the calendar and the cost view, at a 390px phone width and a
// 1200px desktop width, light and dark. Not a test; run by hand with the dev server up:
//
//   node --experimental-strip-types apps/portal/e2e/fidelity/compliance.ts
//
// PORTAL_URL overrides the default. The portal's mock signs in with the demo owner from
// storage, so no credential is typed. Uses the installed Google Chrome; no browser download.
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Theme = 'light' | 'dark';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'screens');
const PORTAL_URL = process.env.PORTAL_URL ?? 'http://localhost:5197';
const WIDTHS = [390, 1200] as const;

const PORTAL_SESSION = {
  email: 'owner@example.com',
  firstName: 'Layla',
  lastName: 'Haddad',
  phone: '',
  timeZone: 'Asia/Dubai',
  notificationEmail: '',
};

interface Shot {
  readonly name: string;
  readonly hash: string;
  readonly ready: string;
  // A card to open from the board before the capture, by its title.
  readonly openCard?: string;
}

const SHOTS: readonly Shot[] = [
  { name: 'compliance', hash: '#/compliance', ready: '.cgroup' },
  { name: 'compliance-urgent', hash: '#/compliance?state=urgent', ready: '.cgroup' },
  { name: 'compliance-company', hash: '#/companies/co-alreef/compliance', ready: '.cgroup' },
  {
    name: 'card',
    hash: '#/companies/co-alreef/compliance',
    ready: '.cpage .steps',
    openCard: 'Licence renewal',
  },
  { name: 'decision', hash: '#/companies/co-alreef/decision', ready: '.decision .choices' },
  {
    name: 'decision-srtip',
    hash: '#/companies/co-demo-noor/decision',
    ready: '.decision .choices',
  },
  {
    name: 'tracker',
    hash: '#/companies/co-sahara/trackers/cancellation',
    ready: '.tracker .steps',
  },
  { name: 'calendar', hash: '#/calendar', ready: '.tl__row' },
  { name: 'cost', hash: '#/costs', ready: '.cline' },
];

async function portalPage(browser: Browser, theme: Theme, width: number): Promise<Page> {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 800 ? 844 : 900 },
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  await ctx.addInitScript(
    ({ chosen, session }: { chosen: Theme; session: typeof PORTAL_SESSION }) => {
      localStorage.setItem('boasis.theme', chosen);
      localStorage.setItem('boasis.portal.session', JSON.stringify(session));
      localStorage.removeItem('boasis.portal.mock');
      document.documentElement.setAttribute('data-theme', chosen);
    },
    { chosen: theme, session: PORTAL_SESSION },
  );
  const page = await ctx.newPage();
  await page.goto(`${PORTAL_URL}/#/compliance`);
  await page.locator('.cgroup').first().waitFor({ timeout: 20_000 });
  return page;
}

async function capture(page: Page, shot: Shot, theme: Theme, width: number): Promise<void> {
  await page.evaluate((next: string) => {
    location.hash = next;
  }, shot.hash);
  if (shot.openCard !== undefined) {
    await page.locator('.cgroup').first().waitFor({ timeout: 15_000 });
    await page.locator('.compliance-card').filter({ hasText: shot.openCard }).first().click();
  }
  await page.locator(shot.ready).first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  const buffer = await page.screenshot({ fullPage: true });
  const file = `${shot.name}-${theme}-${String(width)}.png`;
  await writeFile(join(OUT, file), buffer);
  console.log(`wrote ${file}`);
}

async function main(): Promise<void> {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome' });
  try {
    for (const theme of ['light', 'dark'] as const) {
      for (const width of WIDTHS) {
        const page = await portalPage(browser, theme, width);
        for (const shot of SHOTS) {
          await capture(page, shot, theme, width);
        }
        await page.context().close();
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
