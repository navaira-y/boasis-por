import { mkdir } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import type { FakeSupabase } from '../harness/fake-supabase.ts';

/** Run with BROWSER_EXECUTABLE_PATH set, alongside the real next start harness. */
export async function checkInBrowser(origin: string, fake: FakeSupabase): Promise<void> {
  const executablePath = process.env.BROWSER_EXECUTABLE_PATH;
  const browser = await chromium.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    await mkdir('test-results', { recursive: true });
    fake.setMode('healthy');
    fake.setHasProfile(true);
    fake.setSubscriptionStatus('active');
    await fetch(`${origin}/api/health?fresh=1`);
    for (const width of [320, 1280]) {
      for (const colorScheme of ['light', 'dark'] as const) {
        const context = await browser.newContext({
          viewport: { width, height: 900 }, colorScheme, serviceWorkers: 'block',
        });
        // This sandbox cannot reach the font CDN. Layout is still exercised in
        // both themes with real CSS and the browser's fallback font.
        await context.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ contentType: 'text/css', body: '' }));
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${origin}/signup`);
        await page.locator('#email').fill('navaira.builds@gmail.com');
        await page.getByRole('button', { name: 'Continue', exact: true }).click();
        await page.getByRole('button', { name: 'Continue →', exact: true }).click();
        await page.locator('#fullName').fill('Test Owner');
        await page.locator('#password').fill('A-test-password-not-used-live');
        await page.locator('input[name="terms"]').check();
        await page.getByRole('button', { name: 'Create my account', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
        const layout = await page.evaluate(() => {
          const guide = document.querySelector('.guide');
          const panel = document.querySelector('.panel');
          const rows = Array.from(document.querySelectorAll('.guide li')).map((li) => li.getBoundingClientRect());
          const next = guide?.nextElementSibling?.getBoundingClientRect();
          const boxes = Array.from(document.querySelectorAll('.code-boxes input')).map((input) => input.getBoundingClientRect());
          const card = panel?.getBoundingClientRect();
          return {
            noOverlap: rows.every((row, i) => i === 0 || row.top >= (rows[i - 1]?.bottom ?? 0)) &&
              (next?.top ?? 0) >= (rows.at(-1)?.bottom ?? 0),
            boxesContained: card !== undefined && boxes.every((box) => box.left >= card.left && box.right <= card.right),
            noHorizontalScroll: document.documentElement.scrollWidth <= innerWidth,
          };
        });
        expect(layout).toEqual({ noOverlap: true, boxesContained: true, noHorizontalScroll: true });
        await page.screenshot({ path: `test-results/inbox-${String(width)}-${colorScheme}.png`, fullPage: true });
        // Unknown length: an eight-digit code can still be entered, never cut
        // off or auto-submitted at the guessed sixth digit.
        await page.getByRole('textbox', { name: 'Digit 1', exact: true }).pressSequentially('12345678');
        const digits = await page.locator('.code-boxes input').evaluateAll((inputs) =>
          inputs.map((input) => (input as HTMLInputElement).value).join(''));
        expect(digits).toBe('12345678');
        await expect(page.getByRole('button', { name: 'Verify code', exact: true })).toBeEnabled();

        // Fresh browser context: no mock localStorage login. The callback sets
        // the real cookie, then the unchanged portal screens must open directly.
        await context.request.get(`${origin}/auth/callback?token_hash=e2e-ok&type=email`);
        const missing: string[] = [];
        page.on('response', (response) => {
          if (response.url().startsWith(`${origin}/portal/`) && response.status() >= 400) missing.push(response.url());
        });
        await page.goto(`${origin}/portal`);
        await expect(page.locator('.firstrun')).toBeVisible();
        expect(page.url()).not.toContain('#/auth');
        await expect(page.locator('.firstrun .add')).toBeVisible();
        await page.locator('.firstrun .add').click();
        await expect(page).toHaveURL(/#\/add-company$/);
        await page.goto(`${origin}/portal#/companies`);
        await expect(page.locator('.shell')).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Your companies', exact: true })).toBeVisible();
        await page.screenshot({ path: `test-results/portal-${String(width)}-${colorScheme}.png`, fullPage: true });
        for (const [path, heading] of [
          ['/library', 'Library'], ['/compliance', 'Your compliance status'], ['/services', 'Services'],
        ] as const) {
          await page.goto(`${origin}/portal#${path}`);
          await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        }
        expect(errors).toEqual([]);
        expect(missing).toEqual([]);
        console.log(`  PASS  browser ${String(width)}px ${colorScheme}: code layout, typing, portal home, add-company, companies, library, compliance and services`);
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
