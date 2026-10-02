import { expect, test } from '@playwright/test';

test('home holds the dial and one item, and opening a company shows the company page', async ({
  page,
}) => {
  await page.goto('/#/');
  const top = page.locator('.topitem');
  await expect(top).toBeVisible();
  await expect(top.getByRole('button', { name: 'Open' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your companies' })).toHaveCount(0);

  await page.goto('/#/companies');
  const card = page.locator('.cocard').filter({ hasText: 'Noor Digital FZE' }).first();
  await expect(card).toBeVisible();
  await card.locator('.cocard__open').click();
  await expect(page).toHaveURL(/#\/companies\/co-demo-noor$/);
  await expect(page.getByRole('heading', { name: 'Noor Digital FZE', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'On the licence' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upcoming dates' })).toBeVisible();
});
