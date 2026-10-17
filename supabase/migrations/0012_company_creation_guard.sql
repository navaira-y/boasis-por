-- Company creation, Oct 3 decision: one owned company until payment exists.
-- New migration only. No rows are changed or deleted; applied files stay intact.
-- A private lock row serializes inserts, including direct REST and service-role
-- inserts. The old COUNT-only trigger let simultaneous inserts both pass.
-- Ownership changes are refused: inviting a member never transfers the payer.
begin;

-- A real row version, rather than SELECT FOR UPDATE alone: this also forces
-- stale REPEATABLE READ transactions to abort instead of counting an old view.
create table if not exists public.company_creation_locks (
  owner_profile_id uuid primary key references public.profiles(id) on delete cascade,
  revision bigint not null default 1
);
alter table public.company_creation_locks enable row level security;
revoke all on public.company_creation_locks from public, anon, authenticated;

create or replace function public.company_creation_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count bigint;
  v_active boolean;
begin
  if v_uid is null then
    raise exception 'Sign in is required.' using errcode = '42501';
  end if;
  select count(*) into v_count from public.companies where owner_profile_id = v_uid;
  select exists (
    select 1 from public.subscriptions
    where profile_id = v_uid and status = 'active'
      and current_period_end > statement_timestamp()
  ) into v_active;
  return jsonb_build_object(
    'canCreate', v_active and v_count < 1,
    'reason', case
      when not v_active then 'subscription-inactive'
      when v_count >= 1 then 'payment-coming-soon'
      else 'allowed'
    end,
    'ownedCompanies', v_count,
    'companyLimit', 1
  );
end;
$$;
revoke all on function public.company_creation_access() from public, anon;
grant execute on function public.company_creation_access() to authenticated;

create or replace function public.enforce_company_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_end timestamptz;
  v_count bigint;
begin
  -- BEFORE triggers run before RLS WITH CHECK. Refuse foreign-owner writes
  -- before counting anything, so their error cannot become a tenant oracle.
  if (auth.uid() is not null and new.owner_profile_id is distinct from auth.uid())
     or (auth.uid() is null and current_setting('role', true) in ('anon', 'authenticated')) then
    raise exception 'You can only add a company to your own account.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if new.owner_profile_id is distinct from old.owner_profile_id then
      raise exception 'Company ownership cannot be changed through an update.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Competing transactions wait here. READ COMMITTED then sees the preceding
  -- commit; REPEATABLE READ and SERIALIZABLE abort if their view became stale.
  insert into public.company_creation_locks (owner_profile_id)
    values (new.owner_profile_id)
    on conflict (owner_profile_id) do update
      set revision = public.company_creation_locks.revision + 1;

  select status, current_period_end into v_status, v_end
  from public.subscriptions where profile_id = new.owner_profile_id for share;
  if not found or v_status <> 'active' or v_end is null or v_end <= statement_timestamp() then
    raise exception 'Active access is required before adding a company.'
      using errcode = 'P0001', detail = 'BOASIS_SUBSCRIPTION_INACTIVE';
  end if;

  select count(*) into v_count from public.companies where owner_profile_id = new.owner_profile_id;
  if v_count >= 1 then
    raise exception 'Online payment opens soon. The payment gateway will appear here to unlock your second company.'
      using errcode = 'P0001', detail = 'BOASIS_COMPANY_LIMIT';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_company_limit() from public, anon, authenticated;

-- The original INSERT trigger already calls the function replaced above.
-- Also refuse UPDATE ownership bypasses, including privileged API mistakes.
create or replace trigger trg_company_owner_immutable
  before update of owner_profile_id on public.companies
  for each row execute function public.enforce_company_limit();

commit;

-- Operator proof. Every result should be true; no customer data is returned.
select
  to_regprocedure('public.company_creation_access()') is not null as guard_installed,
  exists (select 1 from pg_trigger where tgrelid = 'public.companies'::regclass
    and tgname = 'trg_company_owner_immutable' and tgenabled = 'O') as owner_update_guard_installed,
  (select relrowsecurity from pg_class where oid = 'public.company_creation_locks'::regclass) as private_lock_rls_enabled,
  not has_function_privilege('anon', 'public.company_creation_access()', 'EXECUTE') as anonymous_access_denied,
  has_function_privilege('authenticated', 'public.company_creation_access()', 'EXECUTE') as authenticated_can_check;
