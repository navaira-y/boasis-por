import { addDays, addMonths, lastDayOfMonth } from '@boasis/rules';
import { expect, test, type Page } from '@playwright/test';
import { today } from '../src/lib/today';

// Onboarding v2 walkthroughs: a new account from step 0 to the year, signed out at the start.
test.use({ storageState: { cookies: [], origins: [] } });

const T = today();

async function chooseDate(page: Page, testId: string, date: string) {
  const [year = '', month = '', day = ''] = date.split('-');
  const selects = page.getByTestId(testId).locator('select');
  await selects.nth(2).selectOption(year);
  await selects.nth(1).selectOption(String(Number(month)));
  await selects.nth(0).selectOption(String(Number(day)));
}

async function pick(page: Page, group: string, option: string) {
  await page
    .getByRole('group', { name: group })
    .getByRole('radio', { name: option, exact: true })
    .click();
}

async function signUp(page: Page, name: string, email: string, plan: RegExp) {
  await page.goto('/#/auth');
  // The gate speaks of free zones only.
  await expect(
    page.getByText('in any of the 42 UAE free zones. Mainland is coming soon.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Create one' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('short');
  await page.getByRole('radio', { name: plan }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 12 characters.')).toBeVisible();
  await expect(page.getByText('Tick to accept the terms and privacy notice.')).toBeVisible();
  await page.getByLabel('Password').fill('a-long-enough-password');
  await page.getByRole('checkbox', { name: 'I accept the terms and privacy notice' }).check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.getByRole('button', { name: 'Verify now' }).click();
  await expect(
    page.getByRole('heading', { name: 'Where is your company licensed?' }),
  ).toBeVisible();
}

async function whereLicensed(page: Page, search: string, zone: string) {
  await pick(page, 'Jurisdiction', 'Free zone');
  await page.getByPlaceholder('Search the zones').fill(search);
  await page.getByRole('radio', { name: zone }).check();
  await pick(page, 'Your role in this company', 'Owner');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your licence' })).toBeVisible();
}

async function licence(
  page: Page,
  name: string,
  number: string,
  form: string,
  incorporated = addMonths(T, -18),
) {
  await page.getByLabel('Company name (as on licence)').fill(name);
  await page.getByLabel('Licence number').fill(number);
  await pick(page, 'Legal form', form);
  await pick(page, 'Licence status', 'Active');
  await chooseDate(page, 'licence-issue', addMonths(T, -6));
  await chooseDate(page, 'licence-expiry', addMonths(T, 6));
  await chooseDate(page, 'incorporation', incorporated);
  await pick(page, 'Who handles your zone paperwork?', 'Me');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Owners and managers' })).toBeVisible();
}

test('a solo founder with one IFZA licence reaches her year', async ({ page }) => {
  await signUp(page, 'Sara Ahmed', 'sara.solo@example.com', /^1 company/);

  // Mainland is coming soon, with a waitlist; the person can still add a free zone company.
  await pick(page, 'Jurisdiction', 'Mainland');
  await expect(page.getByRole('heading', { name: 'Mainland is coming soon' })).toBeVisible();
  await page.getByLabel('Emirate').selectOption('Dubai');
  await page.getByRole('checkbox', { name: 'Email me when mainland opens' }).check();
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByText('You are on the list.')).toBeVisible();
  await page.getByRole('button', { name: 'Add a free zone company instead' }).click();

  await whereLicensed(page, 'IFZA', 'IFZA');
  // IFZA takes applications only through registered partners, shown with its source and grade.
  await expect(page.getByTestId('zone-channel')).toContainText('Partner Portal');
  await licence(page, 'Sara Consulting FZCO', 'IFZA-1001', 'FZCO', addMonths(T, -10));

  // Step 3: the account holder is prefilled as the first person.
  const form = page.getByTestId('person-form');
  await expect(form.getByLabel('Full name')).toHaveValue('Sara Ahmed');
  await pick(page, 'Role in this company', 'Shareholder');
  await form.getByLabel('Ownership %').fill('100');
  await chooseDate(page, 'passport', addMonths(T, 30));
  // Continue with an invalid person stops on the field errors; a valid one is saved on the way.
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Choose who sponsors the residence visa.')).toBeVisible();
  await pick(page, 'Residence visa: who sponsors it?', 'This company');
  await chooseDate(page, 'visa', addMonths(T, 14));
  await chooseDate(page, 'emirates-id', addMonths(T, 14));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your office' })).toBeVisible();

  // Progress is saved after every step: coming back resumes on the office.
  await page.goto('/#/add-company/existing');
  await expect(page.getByRole('heading', { name: 'Your office' })).toBeVisible();

  await pick(page, 'Office type', 'Flexi desk or business centre');
  await chooseDate(page, 'lease-end', addMonths(T, 5));
  await expect(page.getByTestId('lease-warning')).toContainText(
    'Your lease ends before your licence.',
  );
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Visas your company can sponsor' })).toBeVisible();
  await expect(page.getByLabel('Visas used now')).toHaveValue('1');
  await page.getByLabel('Visa quota allowed').fill('1');
  await expect(page.getByTestId('visas-left')).toHaveText('Visas left: 0');
  await chooseDate(page, 'card-expiry', addMonths(T, 20));
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Corporate tax' })).toBeVisible();
  await pick(page, 'Is the company registered for corporate tax?', 'Not sure');
  await expect(page.getByTestId('ct-not-sure')).toBeVisible();
  // Not registered, with the year end: the first return is calculated from CTP003.
  await pick(page, 'Is the company registered for corporate tax?', 'No');
  await page
    .getByRole('group', { name: 'Financial year end' })
    .locator('select')
    .nth(1)
    .selectOption('12');
  await page
    .getByRole('group', { name: 'Financial year end' })
    .locator('select')
    .nth(0)
    .selectOption('31');
  await expect(page.getByTestId('ct-return')).toContainText('calculated from the confirmed rule');
  await expect(page.getByTestId('ct-return')).toContainText(
    'The FTA confirms your first tax period when you register.',
  );
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'VAT', exact: true })).toBeVisible();
  await pick(page, 'Is the company registered for VAT?', 'No');
  await pick(page, 'Taxable sales and imports in the last 12 months', 'Below AED 187,500');
  await pick(page, 'Do you expect them to pass AED 375,000 in the next 30 days?', 'No');
  await expect(page.getByTestId('vat-outcome')).toContainText('Not required now.');
  await expect(
    page.getByText('The FTA looks at your taxable sales and imports over the last 12 months.'),
  ).toBeVisible();
  await expect(
    page.getByText('You must also register if you expect to pass AED 375,000 in the next 30 days.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Your year', level: 1 })).toBeVisible();
  await expect(page.getByTestId('year-next').getByRole('listitem')).toHaveCount(3);
  await expect(page.getByTestId('year-next')).toContainText('Register for corporate tax');
  await expect(page.getByTestId('year-next')).toContainText('Late');
  await expect(page.getByTestId('year-own')).toContainText('Residence visa expires');
  await expect(page.getByTestId('year-all')).toContainText('Licence renewal');

  // The compliance board reads the same computed items: the answered VAT questions leave no
  // turnover question, and the onboarding's passport and lease dates are there.
  await page.goto('/#/compliance');
  await expect(page.getByText('Passport expiry').first()).toBeVisible();
  await expect(page.getByText('Office lease renewal').first()).toBeVisible();
  await expect(page.getByText('Turnover question')).toHaveCount(0);

  // A new account sees only its own companies, none of the demo's.
  await page.goto('/#/companies');
  await expect(page.getByText('Sara Consulting FZCO').first()).toBeVisible();
  await expect(page.getByText('Noor Digital FZE')).toHaveCount(0);
  // The 1-company plan: a second company offers the upgrade.
  await page.goto('/#/add-company/existing');
  await expect(page.getByTestId('plan-limit')).toContainText('Your plan covers 1 company.');
});

test('a founder with a DMCC and a RAKEZ company reuses her people', async ({ page }) => {
  await signUp(page, 'Layla Noor', 'layla.two@example.com', /^Up to 3 companies/);

  await whereLicensed(page, 'DMCC', 'Dubai Multi Commodities Centre (DMCC)');
  await licence(page, 'Noor Trading DMCC', 'DMCC-2002', 'Other');

  // Step 3: Layla and a 40% co-founder, both on this company's visa.
  await pick(page, 'Role in this company', 'Both');
  await page.getByTestId('person-form').getByLabel('Ownership %').fill('60');
  await chooseDate(page, 'passport', addMonths(T, 40));
  await pick(page, 'Residence visa: who sponsors it?', 'This company');
  await chooseDate(page, 'visa', addMonths(T, 10));
  await chooseDate(page, 'emirates-id', addMonths(T, 10));
  await page.getByRole('button', { name: 'Save this person' }).click();
  await page.getByRole('button', { name: 'Add another person' }).click();
  const form = page.getByTestId('person-form');
  await form.getByLabel('Full name').fill('Omar Saleh');
  await pick(page, 'Role in this company', 'Shareholder');
  await form.getByLabel('Ownership %').fill('50');
  await pick(page, 'Residence visa: who sponsors it?', 'This company');
  await page.getByRole('button', { name: 'Save this person' }).click();
  await expect(page.getByText('The total across shareholders must not pass 100.')).toBeVisible();
  await form.getByLabel('Ownership %').fill('40');
  await page.getByRole('button', { name: 'Save this person' }).click();
  await expect(page.getByTestId('person-form')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 4 and 5: a DMCC flexi desk, prefilled with DMCC's confirmed quota.
  await pick(page, 'Office type', 'Flexi desk or business centre');
  await chooseDate(page, 'lease-end', addMonths(T, 9));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Visa quota allowed')).toHaveValue('3');
  await expect(page.getByTestId('quota-prefill')).toContainText('confirmed');
  await expect(page.getByLabel('Visas used now')).toHaveValue('2');
  await page.getByLabel('Visas used now').fill('5');
  await expect(page.getByTestId('over-quota')).toBeVisible();
  await page.getByLabel('Visas used now').fill('2');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 6: registered, first period and year end give the first return date.
  await pick(page, 'Is the company registered for corporate tax?', 'Yes');
  await chooseDate(page, 'first-period-end', lastDayOfMonth(addMonths(T, 3)));
  await expect(page.getByTestId('ct-return')).toContainText('First return and payment due');
  await pick(page, 'Will you claim Qualifying Free Zone Person status?', 'Yes');
  await expect(page.getByTestId('qfzp-audit')).toContainText('Audited financial statements');
  await page.getByRole('button', { name: 'Continue' }).click();

  // Step 7: VAT quarterly.
  await pick(page, 'Is the company registered for VAT?', 'Yes');
  await pick(page, 'Filing period', 'Quarterly');
  await chooseDate(page, 'vat-period-end', lastDayOfMonth(addDays(T, -1)));
  await expect(page.getByTestId('vat-return')).toContainText('Return and payment due');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your year', level: 1 })).toBeVisible();

  // Step 9: three employees on this company's visa.
  await page.getByRole('button', { name: 'Add employees' }).click();
  await expect(page.getByRole('heading', { name: 'Employees on visas' })).toBeVisible();
  for (const name of ['Amina Khan', 'Ravi Menon', 'Joy Santos']) {
    await page.getByLabel('Full name').fill(name);
    await page.getByRole('button', { name: 'Add employee' }).click();
    await expect(page.getByTestId('employees')).toContainText(name);
  }
  await page.getByRole('button', { name: 'Back to your year' }).click();

  // The second company: RAKEZ. Layla, the account holder, comes prefilled with her papers; Omar
  // is offered from the account. Role and sponsor are asked again.
  await page.getByRole('button', { name: 'Add another company' }).click();
  await whereLicensed(page, 'RAKEZ', 'Ras Al Khaimah Economic Zone (RAKEZ)');
  await licence(page, 'Noor Studio FZ-LLC', 'RAKEZ-3003', 'FZ-LLC');
  await expect(page.getByTestId('people-pick')).toContainText('Add Omar Saleh');
  const reused = page.getByTestId('person-form');
  await expect(reused.getByLabel('Full name')).toHaveValue('Layla Noor');
  await expect(reused).toContainText('Their passport, visa and Emirates ID come from their file.');
  await pick(page, 'Role in this company', 'Shareholder');
  await reused.getByLabel('Ownership %').fill('100');
  await pick(page, 'Residence visa: who sponsors it?', 'Another of my companies');
  await pick(page, 'Which of your companies?', 'Noor Trading DMCC');
  await page.getByRole('button', { name: 'Save this person' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await pick(page, 'Office type', 'Flexi desk or business centre');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Visa quota allowed')).toHaveValue('1');
  await expect(page.getByLabel('Visas used now')).toHaveValue('0');
  await page.getByRole('button', { name: "I'll add this later" }).click();
  await page.getByRole('button', { name: "I'll add this later" }).click();
  await page.getByRole('button', { name: "I'll add this later" }).click();

  // The combined year: both companies, Layla's papers once.
  await expect(page.getByRole('heading', { name: 'Your year', level: 1 })).toBeVisible();
  const all = page.getByTestId('year-all');
  await expect(all).toContainText('Noor Trading DMCC');
  await expect(all).toContainText('Noor Studio FZ-LLC');
  await expect(
    page.getByTestId('year-own').getByText('Residence visa expires, Layla Noor'),
  ).toHaveCount(1);
  await expect(page.getByTestId('year-need')).toContainText('Complete: establishment card expiry');
  // Skipping step 5 kept the prefilled quota and visas used.
  await expect(page.getByTestId('year-need')).not.toContainText('Complete: visas used now');
  await expect(page.getByTestId('year-need')).not.toContainText('Complete: visa quota allowed');
});
