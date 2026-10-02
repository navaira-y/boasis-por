import { expect, test } from '@playwright/test';

// Screen 6: the people list renders the two demo people of the demo company.
test('people list renders the two demo people', async ({ page }) => {
  await page.goto('/#/companies/co-demo-noor/people');
  await expect(page.getByRole('heading', { name: 'People' })).toBeVisible();
  await expect(page.getByText('Amina Khan')).toBeVisible();
  await expect(page.getByText('Omar Haddad')).toBeVisible();
});
