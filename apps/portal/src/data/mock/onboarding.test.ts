import { describe, expect, it } from 'vitest';
import { createMockRepos, type Clock } from './repos';
import { DEMO_ACCOUNT_ID, DEMO_COMPANY_ID, DEMO_COMPANY_IDS, seed } from './seed';
import { memoryAdapter, MOCK_VERSION, type StorageAdapter } from './store';

const clock: Clock = { today: () => '2026-09-28', now: () => '2026-09-28T10:00:00+04:00' };

function repos(adapter: StorageAdapter = memoryAdapter()) {
  return createMockRepos(adapter, undefined, clock);
}

describe('the account (step 0)', () => {
  it('creates the account unverified, and the verify action stands in for the link', async () => {
    const r = repos();
    const account = await r.auth.signUp({
      fullName: 'Sara Ahmed',
      email: 'sara@example.com',
      password: 'a-long-enough-password',
      plan: 'one-company',
      termsVersion: '2026-09-28',
      twoStepOn: false,
    });
    expect(account.emailVerifiedOn).toBeNull();
    expect(account.termsAcceptedOn).toBe('2026-09-28');
    expect(JSON.stringify(account)).not.toContain('a-long-enough-password');
    const verified = await r.auth.verifyEmail(account.id);
    expect(verified.emailVerifiedOn).toBe('2026-09-28');
    await expect(
      r.auth.signUp({
        fullName: 'Sara Again',
        email: 'SARA@example.com',
        password: 'a-long-enough-password',
        plan: 'one-company',
        termsVersion: '2026-09-28',
        twoStepOn: false,
      }),
    ).rejects.toThrow('already exists');
  });

  it('finds no leaked password in the mock check', async () => {
    expect(await repos().passwords.check('anything')).toBe('ok');
  });

  it('seeds the demo owner verified, holding the demo companies', async () => {
    const r = repos();
    const account = await r.accounts.get(DEMO_ACCOUNT_ID);
    expect(account?.emailVerifiedOn).not.toBeNull();
    expect((await r.accounts.companies(DEMO_ACCOUNT_ID)).map((link) => link.companyId)).toEqual([
      ...DEMO_COMPANY_IDS,
    ]);
  });
});

describe('what a signed-in account sees', () => {
  const as = (email: string) => () => ({ ownerName: 'Someone', actingAs: null, email });

  it('shows a new account none of the demo companies or grants', async () => {
    const adapter = memoryAdapter();
    const r = createMockRepos(adapter, as('new@example.com'), clock);
    const account = await r.auth.signUp({
      fullName: 'New Person',
      email: 'new@example.com',
      password: 'a-long-enough-password',
      plan: 'one-company',
      termsVersion: '2026-09-28',
      twoStepOn: false,
    });
    expect(await r.companies.list()).toEqual([]);
    expect(await r.access.list()).toEqual([]);
    const noor = await r.companies.get(DEMO_COMPANY_ID);
    if (noor === null) {
      throw new Error('the demo company is missing');
    }
    const mine = await r.companies.create({
      ...noor,
      identity: { ...noor.identity, licenceNumber: 'NEW-1' },
    });
    await r.accounts.linkCompany({
      accountId: account.id,
      companyId: mine.id,
      role: 'owner',
      addedOn: '2026-09-28',
    });
    expect((await r.companies.list()).map((company) => company.id)).toEqual([mine.id]);
  });

  it('shows the demo owner the demo companies', async () => {
    const r = createMockRepos(memoryAdapter(), as('OWNER@example.com'), clock);
    expect(await r.companies.list()).toHaveLength(DEMO_COMPANY_IDS.length);
    expect((await r.access.list()).length).toBeGreaterThan(0);
  });
});

describe('the onboarding records', () => {
  it('says whether a licence number is taken under a zone, and nothing more', async () => {
    const r = repos();
    const noor = await r.companies.get(DEMO_COMPANY_ID);
    const number = noor?.identity.licenceNumber ?? '';
    expect(await r.companies.licenceTaken('srtip', ` ${number.toLowerCase()} `)).toBe(true);
    expect(await r.companies.licenceTaken('ifza', number)).toBe(false);
  });

  it('opens a task per open item and closes it once the item is answered', async () => {
    const r = repos();
    const first = await r.onboarding.syncTasks(
      DEMO_COMPANY_ID,
      [
        { item: 'lease-end', personId: null, reason: 'skipped', whoCanAnswer: ['you', 'zone'] },
        { item: 'office-type', personId: null, reason: 'unknown', whoCanAnswer: ['you'] },
      ],
      ['office-type', 'lease-end', 'renews-with-licence'],
    );
    expect(first.filter((task) => task.status === 'open')).toHaveLength(2);
    const second = await r.onboarding.syncTasks(
      DEMO_COMPANY_ID,
      [{ item: 'lease-end', personId: null, reason: 'skipped', whoCanAnswer: ['you'] }],
      ['office-type', 'lease-end', 'renews-with-licence'],
    );
    expect(second.find((task) => task.item === 'office-type')?.status).toBe('done');
    expect(second.find((task) => task.item === 'lease-end')?.status).toBe('open');
    // A step's sync leaves the tasks of other steps alone.
    await r.onboarding.syncTasks(DEMO_COMPANY_ID, [], ['vat-registration']);
    const tasks = await r.onboarding.tasks(DEMO_COMPANY_ID);
    expect(tasks.find((task) => task.item === 'lease-end')?.status).toBe('open');
  });

  it('keeps one role per person and company', async () => {
    const r = repos();
    const person = await r.accountPeople.create({
      accountId: DEMO_ACCOUNT_ID,
      name: 'Omar Saleh',
      email: null,
      passportExpiry: { state: 'skipped', value: null, origin: 'user', enteredOn: '2026-09-28' },
      residenceVisa: { sponsor: { kind: 'not-resident' }, expiry: null },
      emiratesIdExpiry: null,
    });
    await r.roles.put({
      personId: person.id,
      companyId: DEMO_COMPANY_ID,
      kind: 'manager',
      ownershipPercent: null,
    });
    await r.roles.put({
      personId: person.id,
      companyId: DEMO_COMPANY_ID,
      kind: 'both',
      ownershipPercent: { state: 'known', value: 40, origin: 'user', enteredOn: '2026-09-28' },
    });
    const roles = await r.roles.list(DEMO_COMPANY_ID);
    expect(roles).toHaveLength(1);
    expect(roles[0]?.kind).toBe('both');
  });
});

describe('the mock version', () => {
  it('migrates a stored version 5 copy and keeps its data', () => {
    const rest = seed();
    const v5 = {
      version: 5,
      companies: rest.companies,
      offices: rest.offices,
      people: rest.people,
      documents: rest.documents,
      access: rest.access,
      cards: rest.cards,
      history: rest.history,
      audit: rest.audit,
    };
    let stored = JSON.stringify(v5);
    const adapter: StorageAdapter = {
      read: () => stored,
      write: (value) => {
        stored = value;
      },
    };
    repos(adapter);
    const after = JSON.parse(stored) as { version: number; accounts: unknown[] };
    expect(after.version).toBe(MOCK_VERSION);
    expect(after.accounts).toHaveLength(1);
  });
});
