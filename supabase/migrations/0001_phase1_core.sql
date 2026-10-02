-- ============================================================================
-- 0001 Phase 1: accounts, plans, subscriptions, companies, audit, webhooks
-- Spec: Boasis-Onboarding-v2 (Step 0 account + pricing), Portal_Tech_Stack (RLS)
-- Rules enforced here, not just in app code:
--   1. RLS on every table (default deny; policies open the minimum).
--   2. Plan company limits enforced by TRIGGER, so even a direct Data-API
--      insert cannot bypass the paywall.
--   3. Duplicate companies impossible: unique (authority_id, licence_number).
-- ============================================================================

-- ---------------------------------------------------------------- helpers ---
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- --------------------------------------------------------------- profiles ---
-- 1:1 with auth.users. Created by the signup server action (service role)
-- together with the auth user; never directly by the browser.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 100),
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ plans ---
-- Readable by everyone (even anonymous: signup page shows prices).
create table public.plans (
  id text primary key check (id in ('solo', 'trio')),
  name text not null,
  max_companies smallint not null check (max_companies between 1 and 3),
  price_fils integer not null check (price_fils > 0),  -- integer fils, never floats
  currency char(3) not null default 'AED',
  active boolean not null default true
);

insert into public.plans (id, name, max_companies, price_fils) values
  ('solo', 'Solo — 1 company', 1, 3000),
  ('trio', 'Trio — up to 3 companies', 3, 9000)
on conflict (id) do update set
  name = excluded.name,
  max_companies = excluded.max_companies,
  price_fils = excluded.price_fils;

-- ---------------------------------------------------------- subscriptions ---
-- One row per account; provider-agnostic (stub | stripe | telr | ...).
-- Writes are SERVER ONLY (no insert/update/delete policies for app roles).
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  plan_id text not null references public.plans (id),
  status text not null default 'pending'
    check (status in ('pending', 'incomplete', 'active', 'past_due', 'canceled')),
  provider text not null default 'stub',
  provider_customer_id text,
  provider_subscription_id text unique,
  provider_checkout_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  activated_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------- companies --
-- Minimal Phase-1 shape: ownership + authority + onboarding progress.
-- Full licence/people/office/tax fields arrive with the onboarding migration.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  authority_id text not null,                 -- must exist in content/authorities/index.json
  name text,
  licence_number text,
  onboarding_step smallint not null default 1 check (onboarding_step between 1 and 9),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_no_duplicates unique (authority_id, licence_number)
);
create index companies_owner_idx on public.companies (owner_profile_id);

-- --------------------------------- plan-limit trigger (paywall at DB level) --
create or replace function public.enforce_company_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_max smallint;
  v_count int;
begin
  select s.status, p.max_companies into v_status, v_max
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.profile_id = new.owner_profile_id;

  if not found or v_status <> 'active' then
    raise exception 'subscription is not active' using errcode = 'P0001';
  end if;

  select count(*) into v_count
  from public.companies
  where owner_profile_id = new.owner_profile_id;

  if v_count >= v_max then
    raise exception 'plan company limit reached' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_company_limit
  before insert on public.companies
  for each row execute function public.enforce_company_limit();

-- --------------------------------------------------------- webhook_events ---
-- Idempotency ledger for billing webhooks: (provider, provider_event_id) is
-- unique, so a retried webhook can never double-activate or double-charge.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  constraint webhook_events_no_dupes unique (provider, provider_event_id)
);

-- --------------------------------------------------------------- audit_log --
-- Append-only. No update/delete policies exist on purpose.
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action text not null,          -- e.g. 'subscription.activated'
  entity text not null,          -- e.g. 'subscription'
  entity_id text not null,
  meta jsonb not null default '{}'::jsonb
);
create index audit_log_actor_idx on public.audit_log (actor_profile_id, at desc);

-- ------------------------------------------------------ updated_at hooks ---
create trigger trg_touch_profiles before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trg_touch_subscriptions before update on public.subscriptions
  for each row execute function public.touch_updated_at();
create trigger trg_touch_companies before update on public.companies
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- RLS — default deny everywhere; least privilege below.
-- (Project setting "auto-expose new tables" is OFF, so grants are explicit.)
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.companies enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_log enable row level security;

-- plans: public read (signup shows prices before login). No writes, ever.
grant select on public.plans to anon, authenticated;
create policy "plans are publicly readable"
  on public.plans for select using (true);

-- profiles: owner only.
grant select, insert, update on public.profiles to authenticated;
create policy "profiles: owner can read own"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles: owner can insert own"
  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles: owner can update own"
  on public.profiles for update using (auth.uid() = id);

-- subscriptions: owner can READ own; all writes are server-only (service role
-- bypasses RLS). No insert/update/delete policy = default deny for app roles.
grant select on public.subscriptions to authenticated;
create policy "subscriptions: owner can read own"
  on public.subscriptions for select using (auth.uid() = profile_id);

-- companies: owner full access on own rows only. Plan limits additionally
-- enforced by trigger above (defense in depth).
grant select, insert, update, delete on public.companies to authenticated;
create policy "companies: owner full access on own"
  on public.companies for all
  using (auth.uid() = owner_profile_id)
  with check (auth.uid() = owner_profile_id);

-- webhook_events + audit_log: no grants, no policies → server-only, default deny.
