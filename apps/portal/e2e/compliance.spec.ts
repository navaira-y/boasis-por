import { expect, test } from '@playwright/test';

const STATES = [
  'overdue',
  'expiring',
  'action-soon',
  'decision-needed',
  'unknown',
  'on-track',
  'complete',
] as const;

// Screen 9: the board shows a card in each of the seven states of spec 7.1 with the demo seed.
test('the compliance board shows a card in each of the seven states', async ({ page }) => {
  await page.goto('/#/compliance');
  await expect(page.getByRole('heading', { name: 'Your compliance status' })).toBeVisible();
  await page.locator('.cgroup').first().waitFor();
  for (const state of STATES) {
    expect(await page.locator(`.ccell[data-state="${state}"]`).count(), state).toBeGreaterThan(0);
  }
});

// ?state=urgent shows overdue and blocked cards only.
test('the urgent filter shows overdue and blocked cards', async ({ page }) => {
  await page.goto('/#/compliance?state=urgent');
  await page.locator('.cgroup').first().waitFor();
  const cells = page.locator('.ccell');
  expect(await cells.count()).toBeGreaterThan(0);
  const states = await cells.evaluateAll((nodes) =>
    nodes.map((node) => ({
      state: node.getAttribute('data-state'),
      blocked: node.classList.contains('ccell--blocked'),
    })),
  );
  for (const cell of states) {
    expect(cell.state === 'overdue' || cell.blocked).toBe(true);
  }
});

// Screen 10 and spec 7.3: closing a card with a reference stores the next occurrence.
test('closing the licence card creates the next licence card', async ({ page }) => {
  await page.goto('/#/companies/co-alreef/compliance');
  await page.locator('.cgroup').first().waitFor();
  await page.locator('.compliance-card').filter({ hasText: 'Licence renewal' }).first().click();
  await expect(page.getByRole('heading', { name: 'Licence renewal' })).toBeVisible();
  await page.getByLabel('Reference number').last().fill('DEMO-DET-RENEWAL');
  await page.getByLabel('Issued on').last().fill('2026-09-13');
  await page.getByRole('button', { name: 'I have done this' }).click();
  await expect(page.getByText('Closed. The next one is already on your calendar.')).toBeVisible();
  await page.goto('/#/companies/co-alreef/compliance');
  await page.locator('.cgroup').first().waitFor();
  const licence = page.locator('.ccell').filter({ hasText: 'Licence renewal' });
  await expect(licence).toHaveCount(2);
  expect(
    await page
      .locator('.ccell[data-state="complete"]')
      .filter({ hasText: 'Licence renewal' })
      .count(),
  ).toBe(1);
});

// Screen 13: the SRTIP decision point shows the cancellation terms from the agreement.
test('the SRTIP decision point takes its cancellation terms from the agreement', async ({
  page,
}) => {
  await page.goto('/#/companies/co-demo-noor/decision');
  await expect(page.getByRole('heading', { name: 'Renew, cancel or shrink?' })).toBeVisible();
  await expect(page.getByText('AED 1,500')).toBeVisible();
  expect(await page.locator('.src--document').count()).toBeGreaterThanOrEqual(3);
});
