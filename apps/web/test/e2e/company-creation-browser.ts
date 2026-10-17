import { expect, type Page } from '@playwright/test';
import type { FakeSupabase } from '../harness/fake-supabase.ts';

/** Browser UX proof; the separate PostgreSQL suite proves the actual write/RLS guard. */
export async function checkCompanyCreation(page: Page, origin: string, fake: FakeSupabase): Promise<void> {
  const paymentTitle = page.getByRole('heading', { name: 'Online payment opens soon', exact: true });
  fake.setOwnedCompanyCount(0);
  await page.goto(`${origin}/portal#/add-company`);
  await expect(page.locator('.door')).toHaveCount(2);

  fake.setOwnedCompanyCount(1);
  await page.goto(`${origin}/portal#/companies`);
  await expect(page.getByRole('heading', { name: 'Your companies', exact: true })).toBeVisible();
  // Include pasted links, not just the button a considerate visitor clicks.
  for (const path of ['/add-company', '/add-company/new', '/add-company/existing', '/add-company/existing/licence']) {
    await page.goto(`${origin}/portal#${path}`);
    await expect(paymentTitle).toBeVisible();
    await expect(page.getByText('The payment gateway will appear here to unlock your second company.', { exact: true })).toBeVisible();
    await expect(page.locator('.door')).toHaveCount(0);
    await expect(page.locator('.sheet input')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Back to my companies', exact: true })).toBeVisible();
  }
  const box = await page.getByRole('dialog').boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box).not.toBeNull();
  if (box !== null) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  }
  await page.screenshot({ path: `test-results/company-limit-${String(width)}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Back to my companies', exact: true }).click();
  await expect(page).toHaveURL(/#\/companies$/);

  // The company-list shortcut opens a sheet without navigating. It uses the
  // same guard, so it cannot sneak past the route check.
  const add = page.getByRole('button', { name: 'Add a company', exact: true });
  await add.click();
  await expect(paymentTitle).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paymentTitle).toHaveCount(0);
  await expect(add).toBeFocused();

  fake.setMode('creation-access-down');
  await page.goto(`${origin}/portal#/add-company`);
  await expect(page.getByRole('heading', { name: 'Could not check your company allowance', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.door')).toHaveCount(0);
  fake.setMode('healthy');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(paymentTitle).toBeVisible();

  // A freed slot is read afresh on the next entry, never stuck behind a cached
  // refusal; the original first-company form is still available unchanged.
  fake.setOwnedCompanyCount(0);
  await page.getByRole('button', { name: 'Back to my companies', exact: true }).click();
  await add.click();
  await expect(paymentTitle).toHaveCount(0);
  await expect(page.locator('.src2')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.goto(`${origin}/portal#/add-company`);
  await expect(page.locator('.door')).toHaveCount(2);
}
