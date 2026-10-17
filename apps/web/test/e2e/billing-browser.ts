import { expect, type Page } from '@playwright/test';
import type { FakeSupabase } from '../harness/fake-supabase.ts';

export const FREE_PERIOD = {
  plan_id: 'solo',
  provider: 'free',
  current_period_start: '2026-06-29T08:00:00Z',
  current_period_end: '2027-06-29T08:00:00Z',
  free_year_used_at: '2026-06-29T08:00:00Z',
};

export async function checkBilling(
  page: Page,
  origin: string,
  fake: FakeSupabase,
  suffix: string,
): Promise<void> {
  fake.setSubscription(FREE_PERIOD);
  fake.setSubscriptionStatus('active');
  await page.clock.install({ time: new Date('2026-10-17T19:59:40.000Z') });
  await page.goto(`${origin}/portal#/me/billing`);
  await page.reload();
  const chip = page.getByTestId('subscription-countdown');
  const remaining = page.getByTestId('billing-countdown');
  await expect(chip).toHaveText('8 months, 12 days left');
  await expect(remaining).toHaveText(await chip.innerText());
  await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
  await expect(page.locator('.acct')).toContainText(
    'After your free year: AED 30/month, 1 company.',
  );
  await expect(page.locator('.acct')).not.toContainText('Standard');
  await expect(page.locator('.acct')).not.toContainText('trial');
  await expect(chip).toHaveAttribute('href', `${origin}/portal#/me/billing`);
  await page.goto(`${origin}/portal#/companies`);
  await expect(page.getByRole('heading', { name: 'Your companies', exact: true })).toBeVisible();
  await chip.click();
  await expect(page.getByRole('heading', { name: 'Billing', exact: true })).toBeVisible();
  await expect(remaining).toHaveText(await chip.innerText());
  const header = await page.locator('.top-bar').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const children = [...element.querySelectorAll('a,button')].map((item) =>
      item.getBoundingClientRect(),
    );
    return {
      contained: children.every((child) => child.left >= rect.left && child.right <= rect.right),
      noOverlap: children.every(
        (child, index) => index === 0 || child.left >= (children[index - 1]?.right ?? 0),
      ),
      noPageOverflow: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  expect(header).toEqual({ contained: true, noOverlap: true, noPageOverflow: true });
  await page.screenshot({ path: `test-results/billing-${suffix}.png`, fullPage: true });
  await page.clock.pauseAt(new Date('2026-10-17T19:59:59.000Z'));
  await page.clock.fastForward(1100);
  await page.clock.resume();
  await expect(chip).toHaveText('8 months, 11 days left');
  await expect(remaining).toHaveText(await chip.innerText());

  const refetch = async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  };
  for (const plan of ['solo', 'trio', 'enterprise']) {
    fake.setSubscription({
      plan_id: plan,
      provider: 'ziina',
      current_period_start: '2026-10-01T08:00:00Z',
      current_period_end: '2026-11-01T08:00:00Z',
    });
    await refetch();
    await expect(chip).toHaveText('14 days left');
    await expect(remaining).toHaveText('14 days left');
    await expect(page.locator('.acct .abox').first()).not.toContainText('Free year');
    await expect(chip).toHaveAccessibleName(
      new RegExp(`${plan.charAt(0).toUpperCase() + plan.slice(1)}:`),
    );
  }
  fake.setSubscription({ plan_id: 'solo', current_period_end: '2026-10-25T08:00:00Z' });
  await refetch();
  await expect(chip).toHaveText('7 days left');
  await expect(chip).toHaveClass(/--warn/);
  await page.screenshot({ path: `test-results/billing-warning-${suffix}.png`, fullPage: true });
  // Status change while the portal is open: do not weaken the server gate merely
  // to render an ended chip. A refresh with this status must go to web Billing.
  fake.setSubscriptionStatus('past_due');
  await refetch();
  await expect(chip).toHaveText('Plan ended — renew to unlock');
  await expect(chip).toHaveAttribute('href', '/billing');
  await expect(remaining).toHaveText(await chip.innerText());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await chip.click();
  await expect(page).toHaveURL(`${origin}/billing`);
  await expect(page.getByTestId('billing-countdown')).toHaveText('Plan ended — renew to unlock');
  await expect(page.locator('.panel')).not.toContainText('Your first year is free');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/web-billing-ended-${suffix}.png`, fullPage: true });

  fake.setSubscription(FREE_PERIOD);
  fake.setSubscriptionStatus('active');
  await page.goto(`${origin}/portal#/me/billing`);
  await expect(chip).toBeVisible();
  fake.setSubscriptionStatus(null);
  await refetch();
  await expect(chip).toHaveCount(0);
  await expect(
    page.getByText('No subscription is set up for this account.', { exact: true }),
  ).toBeVisible();
  fake.setSubscriptionStatus('active');
  fake.setMode('subscription-down');
  await refetch();
  await expect(page.getByRole('alert')).toContainText('Could not load your subscription', {
    timeout: 15_000,
  });
  await expect(chip).toHaveCount(0);
  fake.setMode('healthy');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(chip).toHaveText('8 months, 11 days left');
  await expect(remaining).toHaveText(await chip.innerText());
}
