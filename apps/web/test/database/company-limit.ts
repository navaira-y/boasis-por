import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Client } from 'pg';

/**
 * Real PostgreSQL proof, not a mocked count. Run only on a fresh disposable DB:
 * PGHOST=... PGPORT=... PGUSER=... PGPASSWORD=... PGDATABASE=boasis_company_limit_test
 * npm run test:database --workspace @boasis/web
 *
 * Never use production credentials here. This harness refuses any other DB name,
 * requires a blank public schema, and applies the actual migration chain. Auth
 * identity is emulated by the same request.jwt.claim.sub setting RLS reads.
 */
assert.equal(
  process.env.PGDATABASE,
  'boasis_company_limit_test',
  'Use the dedicated disposable test database.',
);
const clients: Client[] = [];
async function connect(userId?: string): Promise<Client> {
  const client = new Client();
  clients.push(client);
  await client.connect();
  if (userId !== undefined) {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    await client.query('set role authenticated');
  }
  return client;
}
const users = Array.from(
  { length: 10 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
const user = (index: number): string => {
  const id = users[index];
  assert.ok(id);
  return id;
};
let checks = 0;
function pass(name: string): void {
  checks += 1;
  console.log(`PASS ${name}`);
}
async function denied(run: () => Promise<unknown>, code: string, detail?: string): Promise<void> {
  await assert.rejects(
    run,
    (error: unknown) =>
      error instanceof Error &&
      Reflect.get(error, 'code') === code &&
      (detail === undefined || Reflect.get(error, 'detail') === detail),
  );
}
async function insert(client: Client, owner: string, licence: string): Promise<void> {
  await client.query(
    'insert into public.companies (owner_profile_id, authority_id, licence_number) values ($1, $2, $3)',
    [owner, 'test-zone', licence],
  );
}

try {
  const admin = await connect();
  const existing = await admin.query<{ count: string }>(
    "select count(*) from information_schema.tables where table_schema = 'public'",
  );
  assert.equal(existing.rows[0]?.count, '0', 'Refusing to touch a database with existing tables.');
  await admin.query(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end $$;
    create schema auth;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table auth.mfa_factors (id uuid primary key, user_id uuid references auth.users(id), status text, factor_type text);
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
    $$;
    grant execute on function auth.jwt() to anon, authenticated, service_role;
    grant usage on schema auth, public to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  `);
  const migrations = new URL('../../../../supabase/migrations/', import.meta.url);
  for (const name of (await readdir(migrations))
    .filter((name) => /^00\d\d_.*\.sql$/.test(name))
    .sort()) {
    await admin.query(await readFile(new URL(name, migrations), 'utf8'));
  }
  pass('the actual migration chain applies to a clean PostgreSQL database');
  await admin.query(await readFile(new URL('0012_company_creation_guard.sql', migrations), 'utf8'));
  pass('migration 0012 is safe to apply twice');
  await admin.query(await readFile(new URL('0013_authenticator_mfa.sql', migrations), 'utf8'));
  await admin.query(await readFile(new URL('0013_authenticator_mfa.sql', migrations), 'utf8'));
  assert.equal(
    (await admin.query<{ ready: boolean }>('select public.mfa_guard_ready() as ready')).rows[0]
      ?.ready,
    true,
  );
  pass('migration 0013 is idempotent and all database MFA guards are installed');
  for (const id of users) {
    await admin.query('insert into auth.users values ($1, $2, now())', [id, `${id}@example.com`]);
    await admin.query(
      "insert into public.profiles (id, full_name, terms_version) values ($1, 'Test Owner', 'test')",
      [id],
    );
    await admin.query(
      "insert into public.subscriptions (profile_id, plan_id, status, current_period_end) values ($1, 'solo', 'active', now() + interval '1 day')",
      [id],
    );
  }
  const owner = await connect(user(0));
  const ownSubscription = await owner.query<{ profile_id: string; plan_id: string }>(
    'select profile_id, plan_id, provider, current_period_start, current_period_end, free_year_used_at from public.subscriptions',
  );
  assert.equal(ownSubscription.rowCount, 1);
  assert.equal(ownSubscription.rows[0]?.profile_id, user(0));
  assert.equal(ownSubscription.rows[0].plan_id, 'solo');
  pass('Billing subscription columns are readable only for the authenticated owner');
  assert.equal(
    (await owner.query('select * from public.subscriptions where profile_id = $1', [user(1)]))
      .rowCount,
    0,
  );
  pass('another tenant cannot read a subscription even with its exact profile id');
  await denied(
    () =>
      owner.query(
        "update public.subscriptions set current_period_end = now() + interval '10 years' where profile_id = $1",
        [user(0)],
      ),
    '42501',
  );
  pass('the browser cannot extend a free period or forge its countdown source');
  const access = await owner.query<{ access: { canCreate: boolean; companyLimit: number } }>(
    'select public.company_creation_access() as access',
  );
  assert.deepEqual(access.rows[0]?.access, {
    canCreate: true,
    reason: 'allowed',
    ownedCompanies: 0,
    companyLimit: 1,
  });
  await insert(owner, user(0), 'first');
  await denied(() => insert(owner, user(0), 'second'), 'P0001', 'BOASIS_COMPANY_LIMIT');
  pass('the first company works and direct REST-equivalent second writes are refused');
  await denied(
    () =>
      owner.query('update public.subscriptions set plan_id = $1 where profile_id = $2', [
        'trio',
        user(0),
      ]),
    '42501',
  );
  await denied(() => owner.query('select * from public.company_creation_locks'), '42501');
  pass('the browser cannot change entitlements or touch the private lock rows');
  const outsider = await connect(user(1));
  assert.equal((await outsider.query('select * from public.companies')).rowCount, 0);
  await denied(() => insert(outsider, user(0), 'foreign'), '42501');
  const foreignId = (
    await admin.query<{ id: string }>(
      'select id from public.companies where owner_profile_id = $1',
      [user(0)],
    )
  ).rows[0]?.id;
  assert.ok(foreignId);
  await denied(
    () =>
      outsider.query(
        'insert into public.portal_account_companies (account_id, company_id, role, added_on) values ($1, $2, $3, current_date)',
        [user(1), foreignId, 'owner'],
      ),
    '42501',
  );
  pass('other tenants cannot read companies, claim ownership, or use limit errors as an oracle');
  await denied(
    () => owner.query('update public.companies set owner_profile_id = $1', [user(1)]),
    '42501',
  );
  pass('UPDATE ownership cannot bypass the one-company guard');
  const anonymous = await connect();
  await anonymous.query('set role anon');
  await denied(() => anonymous.query('select * from public.subscriptions'), '42501');
  pass('anonymous callers cannot read subscription dates or plan assignments');
  await denied(() => anonymous.query('select public.company_creation_access()'), '42501');
  const noIdentity = await connect();
  await noIdentity.query('set role authenticated');
  await denied(() => noIdentity.query('select public.company_creation_access()'), '42501');
  pass('anonymous and identity-less callers cannot use the entitlement RPC');
  await admin.query("update public.subscriptions set status = 'past_due' where profile_id = $1", [
    user(2),
  ]);
  const expired = await connect(user(2));
  await denied(() => insert(expired, user(2), 'inactive'), 'P0001', 'BOASIS_SUBSCRIPTION_INACTIVE');
  await admin.query(
    "update public.subscriptions set status = 'active', current_period_end = now() - interval '1 second' where profile_id = $1",
    [user(2)],
  );
  await denied(() => insert(expired, user(2), 'expired'), 'P0001', 'BOASIS_SUBSCRIPTION_INACTIVE');
  pass('expired or inactive access fails closed even before the renewal job runs');
  await admin.query(
    "update public.subscriptions set plan_id = 'trio', provider = 'free' where profile_id = $1",
    [user(3)],
  );
  const wish = await connect(user(3));
  await insert(wish, user(3), 'wish-first');
  await denied(() => insert(wish, user(3), 'wish-second'), 'P0001', 'BOASIS_COMPANY_LIMIT');
  pass('a Trio label without a real payment integration grants no extra company');
  const batch = await connect(user(4));
  await denied(
    () =>
      batch.query(
        "insert into public.companies (owner_profile_id, authority_id, licence_number) values ($1, 'test-zone', 'batch1'), ($1, 'test-zone', 'batch2')",
        [user(4)],
      ),
    'P0001',
    'BOASIS_COMPANY_LIMIT',
  );
  assert.equal((await batch.query('select * from public.companies')).rowCount, 0);
  pass('multi-row over-limit inserts roll back atomically');
  for (const [offset, isolation] of [
    'read committed',
    'repeatable read',
    'serializable',
  ].entries()) {
    const id = user(offset + 5);
    const first = await connect(id);
    const second = await connect(id);
    await first.query(`begin isolation level ${isolation}`);
    await second.query(`begin isolation level ${isolation}`);
    // Pin both snapshots before either insert. Only a real row-version lock
    // protects the stale REPEATABLE READ case.
    await first.query('select * from public.companies');
    await second.query('select * from public.companies');
    await insert(first, id, `race-first-${String(offset)}`);
    const racing = insert(second, id, `race-second-${String(offset)}`);
    const refusal = denied(
      () => racing,
      isolation === 'read committed' ? 'P0001' : '40001',
      isolation === 'read committed' ? 'BOASIS_COMPANY_LIMIT' : undefined,
    );
    await first.query('commit');
    await refusal;
    await second.query('rollback');
    assert.equal((await first.query('select * from public.companies')).rowCount, 1);
    pass(`simultaneous inserts cannot bypass the cap under ${isolation}`);
  }
  const service = await connect();
  await service.query('set role service_role');
  await denied(() => insert(service, user(0), 'service-second'), 'P0001', 'BOASIS_COMPANY_LIMIT');
  pass('even a privileged backend mistake cannot insert a second company');
  // Updating existing company facts is not adding a company and remains allowed.
  await owner.query("update public.companies set name = 'Updated existing company'");
  assert.equal((await owner.query('select * from public.companies')).rowCount, 1);
  pass('editing the existing company is unchanged');

  await admin.query(
    "insert into auth.mfa_factors values ('33333333-3333-4333-8333-333333333333', $1, 'unverified', 'totp')",
    [user(0)],
  );
  assert.equal((await owner.query('select * from public.profiles')).rowCount, 1);
  pass('an unverified enrollment does not enable MFA or lock out the account');
  await admin.query("update auth.mfa_factors set status = 'verified' where user_id = $1", [
    user(0),
  ]);
  for (const table of [
    'profiles',
    'subscriptions',
    'companies',
    'portal_account_companies',
    'portal_onboarding_starts',
  ]) {
    assert.equal((await owner.query('select * from public.' + table)).rowCount, 0);
  }
  await denied(() => owner.query('select public.company_creation_access()'), '42501');
  await denied(() => owner.query('select public.activate_free_year()'), '42501');
  pass(
    'first-factor sessions cannot read private data or bypass MFA through security-definer RPCs',
  );
  await denied(() => owner.query('select boasis_private.activate_free_year_base()'), '42501');
  await denied(() => owner.query('select boasis_private.company_creation_access_base()'), '42501');
  pass('original RPC implementations cannot be called directly by an authenticated browser');
  assert.equal(
    (await owner.query("update public.profiles set full_name = 'Bypass' where id = $1", [user(0)]))
      .rowCount,
    0,
  );
  await denied(
    () => owner.query('insert into public.portal_waitlist (account_id) values ($1)', [user(0)]),
    '42501',
  );
  pass('first-factor update and insert attempts remain blocked at the database');
  await owner.query('select set_config(\'request.jwt.claims\', \'{"aal":"aal2"}\', false)');
  assert.equal((await owner.query('select * from public.profiles')).rowCount, 1);
  assert.equal((await owner.query('select * from public.companies')).rowCount, 1);
  assert.equal((await owner.query('select public.company_creation_access()')).rowCount, 1);
  assert.equal(
    (await owner.query('select * from public.subscriptions where profile_id = $1', [user(1)]))
      .rowCount,
    0,
  );
  pass('AAL2 restores only owned data, never another tenant or an extra company');
  await denied(() => anonymous.query('select public.mfa_session_allowed()'), '42501');
  await denied(() => owner.query('select * from auth.mfa_factors'), '42501');
  pass('factor lookup cannot reveal secrets or other users through SQL');
  await admin.query('delete from auth.mfa_factors where user_id = $1', [user(0)]);
  await owner.query("select set_config('request.jwt.claims', '{}', false)");
  assert.equal((await owner.query('select * from public.profiles')).rowCount, 1);
  pass('removing the last verified factor restores the normal non-MFA path');
  console.log(`${String(checks)} real PostgreSQL contract checks passed.`);
} finally {
  await Promise.all(clients.map((client) => client.end()));
}
