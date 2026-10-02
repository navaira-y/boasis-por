import { expect, test } from '@playwright/test';

// The data foundation: a demo stored under an older version reseeds on the next start with the
// company file groups, the field history and the audit trail, and every company page still
// opens on the new shapes.
interface StoredSummary {
  readonly version: number;
  readonly history: number;
  readonly audit: number;
  readonly noorManager: string | null;
  readonly grants: number;
}

test('an older stored demo reseeds with the company file, history and audit trail', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem('boasis.e2e.seeded') === null) {
      window.localStorage.setItem(
        'boasis.portal.mock',
        JSON.stringify({ version: 4, companies: [] }),
      );
      window.sessionStorage.setItem('boasis.e2e.seeded', 'yes');
    }
  });
  await page.goto('/#/companies');
  await expect(
    page.locator('.cocard').filter({ hasText: 'Noor Digital FZE' }).first(),
  ).toBeVisible();

  const stored = await page.evaluate((): StoredSummary | null => {
    const raw = window.localStorage.getItem('boasis.portal.mock');
    if (raw === null) {
      return null;
    }
    const data = JSON.parse(raw) as {
      version: number;
      history: unknown[];
      audit: unknown[];
      access: unknown[];
      companies: { id: string; ownership?: { manager: string | null } | null }[];
    };
    const noor = data.companies.find((company) => company.id === 'co-demo-noor');
    return {
      version: data.version,
      history: data.history.length,
      audit: data.audit.length,
      noorManager: noor?.ownership?.manager ?? null,
      grants: data.access.length,
    };
  });
  expect(stored).not.toBeNull();
  expect(stored?.version).toBe(6);
  expect(stored?.history).toBeGreaterThan(10);
  expect(stored?.audit).toBeGreaterThan(30);
  expect(stored?.noorManager).toBe('Amina Khan');
  expect(stored?.grants).toBe(4);
});

const COMPANIES = [
  ['co-alreef', 'Al Reef Trading LLC'],
  ['co-demo-noor', 'Noor Digital FZE'],
  ['co-marasi', 'Marasi Commodities DMCC'],
  ['co-qasr', 'Qasr Al Bahr Consultancy'],
  ['co-hamdan', 'Hamdan Logistics FZCO'],
  ['co-sahara', 'Sahara Ventures FZE'],
] as const;

test('every demo company page opens on the new shapes', async ({ page }) => {
  for (const [id, name] of COMPANIES) {
    await page.goto(`/#/companies/${id}`);
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
});
