import { expect, type Browser, type Page } from '@playwright/test';
import type { FakeSupabase } from '../harness/fake-supabase.ts';

const security = (origin: string) => `${origin}/portal#/me/security`;
async function startSetup(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click();
  await page.getByRole('button', { name: 'Show setup QR code', exact: true }).click();
  await expect(
    page.getByAltText('Scan this account setup QR code with your authenticator app'),
  ).toBeVisible();
  await expect(page.getByTestId('mfa-status')).toHaveText('Off');
  await page.getByText('Cannot scan? Use the manual setup key', { exact: true }).click();
  await expect(page.getByTestId('mfa-manual-key')).toHaveText('JBSWY3DPEHPK3PXP');
}
async function enterCode(page: Page, code = '123456'): Promise<void> {
  await page.getByLabel('Authenticator code', { exact: true }).fill(code);
}

/** Browser/SDK contract proof against fixtures, not a live Auth-provider test. */
export async function checkMfa(
  browser: Browser,
  origin: string,
  fake: FakeSupabase,
): Promise<void> {
  fake.setHasProfile(true);
  fake.setMode('healthy');
  fake.setSubscriptionStatus('active');
  fake.setMfa([]);
  for (const width of [320, 1280]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme,
        serviceWorkers: 'block',
      });
      await context.route('https://fonts.googleapis.com/**', (route) =>
        route.fulfill({ contentType: 'text/css', body: '' }),
      );
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await context.request.get(`${origin}/auth/callback?token_hash=e2e-ok&type=email`);
      await page.goto(security(origin));
      await expect(page.getByTestId('mfa-status')).toHaveText('Off');
      await expect(page.getByRole('button', { name: /Password/ })).toBeDisabled();
      await startSetup(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await page.locator('input[type="tel"]').count()).toBe(0);
      await page.screenshot({
        path: `test-results/authenticator-setup-${String(width)}-${colorScheme}.png`,
        fullPage: true,
      });
      await page.getByRole('button', { name: 'Cancel setup', exact: true }).click();
      await expect(page.getByTestId('mfa-manual-key')).toHaveCount(0);
      await expect(page.getByTestId('mfa-status')).toHaveText('Off');
      if (width === 1280 && colorScheme === 'dark') {
        await startSetup(page);
        await page.getByLabel('Code from the new authenticator', { exact: true }).fill('000000');
        await page.getByRole('button', { name: 'Verify and enable', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('not accepted');
        await expect(page.getByTestId('mfa-status')).toHaveText('Off');
        await page.getByLabel('Code from the new authenticator', { exact: true }).fill('123456');
        await page.getByRole('button', { name: 'Verify and enable', exact: true }).click();
        await expect(page.getByTestId('mfa-status')).toHaveText('On, verified');
        await expect(page.getByTestId('mfa-manual-key')).toHaveCount(0);
        await page.getByRole('button', { name: 'Add backup app', exact: true }).click();
        await enterCode(page);
        await page.getByRole('button', { name: 'Show setup QR code', exact: true }).click();
        await page.getByLabel('Code from the new authenticator', { exact: true }).fill('123456');
        await page.getByRole('button', { name: 'Verify and enable', exact: true }).click();
        await expect(
          page.locator('.arow').filter({ hasText: 'Backup authenticator' }),
        ).toContainText('Verified');
        // A fresh email link is a first factor, not a recovery bypass.
        await page.goto(`${origin}/auth/callback?token_hash=e2e-ok&type=email`);
        await expect(page).toHaveURL(`${origin}/mfa`);
        await page.goto(`${origin}/portal`);
        await expect(page).toHaveURL(`${origin}/mfa`);
        await expect(page.getByLabel('Authenticator', { exact: true })).toBeVisible();
        await page.screenshot({ path: 'test-results/authenticator-signin.png', fullPage: true });
        await enterCode(page);
        await page.getByRole('button', { name: 'Verify and continue', exact: true }).click();
        await expect(page).toHaveURL(/\/portal\/?$/);
        await page.goto(security(origin));
        const primary = page.locator('.arow').filter({ hasText: /^AuthenticatorVerified/ });
        await primary.getByRole('button', { name: 'Remove app', exact: true }).click();
        await page
          .getByLabel('Use a working authenticator')
          .selectOption({ label: 'Backup authenticator' });
        await enterCode(page);
        await page.getByRole('button', { name: 'Verify and remove', exact: true }).click();
        await expect(page.getByTestId('mfa-status')).toHaveText('On, verified');
        await page
          .locator('.arow')
          .filter({ hasText: 'Backup authenticator' })
          .getByRole('button', { name: 'Remove app', exact: true })
          .click();
        await expect(
          page.getByText('Removing your last authenticator', { exact: false }),
        ).toBeVisible();
        await enterCode(page, '000000');
        await page.getByRole('button', { name: 'Verify and remove', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('not accepted');
        await expect(page.getByTestId('mfa-status')).toHaveText('On, verified');
        await enterCode(page);
        await page.getByRole('button', { name: 'Verify and remove', exact: true }).click();
        await expect(page.getByTestId('mfa-status')).toHaveText('Off');
        fake.setMode('mfa-not-ready');
        await page.reload();
        await expect(page.getByRole('alert')).toContainText('No setting has been assumed');
        await expect(page.getByTestId('mfa-status')).toHaveCount(0);
        fake.setMode('healthy');
        await page.getByRole('button', { name: 'Try again', exact: true }).click();
        await expect(page.getByTestId('mfa-status')).toHaveText('Off');
        await page.goto(`${origin}/mfa`);
        await expect(page).toHaveURL(/\/portal\/?$/);
        await page.getByRole('button', { name: 'Your account', exact: true }).click();
        await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
        await expect(page).toHaveURL(origin + '/signin');
        await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
        expect(
          (await context.cookies()).filter((cookie) => cookie.name.includes('-auth-token')),
        ).toEqual([]);
        console.log(
          '  PASS browser authenticator lifecycle: wrong code, verified enable, separately verified backup, future sign-in challenge, backup proof removal, last-factor warning/removal, unavailable/retry, real portal sign-out',
        );
      }
      expect(errors).toEqual([]);
      console.log(
        `  PASS browser authenticator ${String(width)}px ${colorScheme}: QR/manual setup, pending status, safe cancellation, no horizontal overflow`,
      );
      await context.close();
    }
  }
  fake.setMfa([]);
}
