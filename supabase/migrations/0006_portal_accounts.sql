-- ============================================================================
-- 0006 Portal slice 2: account links, onboarding, roles, people, access.
--
-- Accounts themselves are a PROJECTION (auth.users + profiles +
-- subscriptions), so there is no account table: only the records the portal
-- owns. Single-owner semantics in this slice: every row belongs to the
-- signed-in account, or to a company that account owns. Cross-account
-- invites (adviser flows, member logins) need their own invite flow later.
-- Run AFTER 0005. One-time, same process (paste whole file, Run once).
-- ============================================================================

alter table public.profiles
  add column if not exists email_reminders_on boolean not null default true;

-- Which companies an account holds, and in what role.
create table public.portal_account_companies (
  account_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'adviser')),
  added_on date not null,
  created_at timestamptz not null default now(),
  primary key (account_id, company_id)
);

-- Step 1 answered, step 2 not yet saved: answers wait here, keyed by account.
create table public.portal_onboarding_starts (
  account_id uuid primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.portal_onboarding_progress (
  company_id uuid primary key references public.companies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.portal_tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index portal_tasks_company_idx on public.portal_tasks (company_id);

create table public.portal_reminder_emails (
  company_id uuid primary key references public.companies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mainland-branch waitlist, kept outside the company file.
create table public.portal_waitlist (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index portal_waitlist_account_idx on public.portal_waitlist (account_id);

-- One record per human on the account (passport/visa/Emirates ID live here,
-- whichever company they were entered under).
create table public.portal_account_people (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index portal_account_people_account_idx on public.portal_account_people (account_id);

-- A person's part in one company. No FK to the people table: roles are
-- cleaned by the company cascade, and a future invite flow may name people
-- from other accounts.
create table public.portal_roles (
  person_id uuid not null,
  company_id uuid not null references public.companies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (person_id, company_id)
);
create index portal_roles_company_idx on public.portal_roles (company_id);

-- Member access grants (per area, per company).
create table public.portal_access_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index portal_access_grants_account_idx on public.portal_access_grants (account_id);

-- Every company ever created belongs to its owner from birth, whichever path
-- created it (portal, web onboarding, future imports). Runs definer so the
-- link is written deterministically, not subject to the caller's grants.
create or replace function public.link_new_company_to_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.portal_account_companies (account_id, company_id, role, added_on)
  values (NEW.owner_profile_id, NEW.id, 'owner', CURRENT_DATE)
  on conflict do nothing;
  return NEW;
end;
$$;
create trigger trg_link_new_company_to_owner
  after insert on public.companies
  for each row execute function public.link_new_company_to_owner();

-- Backfill: companies created before this migration belong to their owners.
insert into public.portal_account_companies (account_id, company_id, role, added_on)
  select owner_profile_id, id, 'owner', CURRENT_DATE from public.companies
  on conflict do nothing;

-- --------------------------------------------------------------------- RLS --
alter table public.portal_account_companies enable row level security;
alter table public.portal_onboarding_starts enable row level security;
alter table public.portal_onboarding_progress enable row level security;
alter table public.portal_tasks enable row level security;
alter table public.portal_reminder_emails enable row level security;
alter table public.portal_waitlist enable row level security;
alter table public.portal_account_people enable row level security;
alter table public.portal_roles enable row level security;
alter table public.portal_access_grants enable row level security;

grant select, insert, update, delete on public.portal_account_companies to authenticated;
grant select, insert, update, delete on public.portal_onboarding_starts to authenticated;
grant select, insert, update, delete on public.portal_onboarding_progress to authenticated;
grant select, insert, update, delete on public.portal_tasks to authenticated;
grant select, insert, update, delete on public.portal_reminder_emails to authenticated;
grant select, insert, update, delete on public.portal_waitlist to authenticated;
grant select, insert, update, delete on public.portal_account_people to authenticated;
grant select, insert, update, delete on public.portal_roles to authenticated;
grant select, insert, update, delete on public.portal_access_grants to authenticated;

-- Direct ownership: the row names its account.
create policy "portal slice2: own account rows"
  on public.portal_account_companies for all
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "portal slice2: own account rows"
  on public.portal_onboarding_starts for all
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "portal slice2: own account rows"
  on public.portal_waitlist for all
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "portal slice2: own account rows"
  on public.portal_account_people for all
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

create policy "portal slice2: own account rows"
  on public.portal_access_grants for all
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- Company ownership: the row hangs under an owned company.
create policy "portal child: owner via company"
  on public.portal_onboarding_progress for all
  using (exists (
    select 1 from public.companies c
    where c.id = portal_onboarding_progress.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = portal_onboarding_progress.company_id and c.owner_profile_id = auth.uid()
  ));

create policy "portal child: owner via company"
  on public.portal_tasks for all
  using (exists (
    select 1 from public.companies c
    where c.id = portal_tasks.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = portal_tasks.company_id and c.owner_profile_id = auth.uid()
  ));

create policy "portal child: owner via company"
  on public.portal_reminder_emails for all
  using (exists (
    select 1 from public.companies c
    where c.id = portal_reminder_emails.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = portal_reminder_emails.company_id and c.owner_profile_id = auth.uid()
  ));

create policy "portal child: owner via company"
  on public.portal_roles for all
  using (exists (
    select 1 from public.companies c
    where c.id = portal_roles.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = portal_roles.company_id and c.owner_profile_id = auth.uid()
  ));
