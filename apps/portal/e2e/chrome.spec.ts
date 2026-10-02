import { expect, test } from '@playwright/test';

// The sign-in screen has no menu: nothing to navigate to before signing in.
test('the sign-in screen shows neither the rail nor the bottom tabs', async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/#/auth');
  await expect(page.locator('.gate')).toBeVisible();
  await expect(page.locator('.rail')).toHaveCount(0);
  await expect(page.locator('.bottom-tabs')).toHaveCount(0);
  await context.close();
});

// The avatar opens the profile panel, and its entries lead under /me.
test('the avatar opens the profile panel', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Your account' }).click();
  const panel = page.getByTestId('profile-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('menuitem', { name: 'Security and passwords' })).toBeVisible();
  await expect(panel.getByRole('menuitem', { name: 'Sign out' })).toBeVisible();
  await panel.getByRole('menuitem', { name: 'Billing' }).click();
  await expect(page).toHaveURL(/#\/me\/billing$/);
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
});

// The menu: five tabs, the inbox behind the bell.
test('the rail carries the five tabs and the bell opens the inbox', async ({ page }) => {
  await page.goto('/#/');
  const rail = page.locator('.rail');
  await expect(rail.getByRole('link')).toHaveText([
    'Home',
    'Companies',
    'Guide',
    'Compliance',
    'Services',
  ]);
  await page.locator('.top-bar__icon-button').click();
  await expect(page).toHaveURL(/#\/inbox$/);
});

// The office tab on the company page renders the demo premises.
test('the company page has an office tab with the demo premises', async ({ page }) => {
  await page.goto('/#/companies/co-demo-noor/offices');
  await expect(page.getByRole('heading', { name: 'Office' })).toBeVisible();
  await expect(page.getByText('Flexi-desk · SRTIP')).toBeVisible();
});
