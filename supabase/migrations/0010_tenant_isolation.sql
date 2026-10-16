-- ============================================================================
-- 0010 Tenant isolation, tightened at the database itself.
--
-- Why this file exists: 0006 let an account create a link row for ANY company
-- id, and let an account create an access grant naming any company id. Reading
-- other owners' data was still impossible (companies and every company child
-- table are scoped by `companies.owner_profile_id = auth.uid()`, and RLS is on
-- for all of them), so nothing leaked. But a link that says "I hold this
-- company" is a claim the rest of the system is entitled to trust later, and
-- this codebase is about to grow member access. Closing the write is cheap now
-- and impossible to do quietly later.
--
-- What changes:
--   1. portal_account_companies: you may only create or change a link to a
--      company YOU own. Reading links addressed to your own account is
--      untouched, so the shared-access path (owner invites accountant) keeps
--      working when it is built.
--   2. portal_access_grants: a BEFORE INSERT/UPDATE guard that refuses a grant
--      naming a company the writer does not own. The portal already checks this
--      in the app (requireOwnCompany) before every write; this is the same rule
--      where it cannot be bypassed.
--   3. A tidy-up: drop the duplicate "plans are publicly readable" policy 0001
--      created twice, so the policy list on that table is honest.
--
-- Service-role writes (the signup path, the renewal job, the operator) are
-- unaffected: the guard steps aside when there is no session behind the write.
--
-- Run AFTER 0009. One-time, same process (paste the whole file, Run once).
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

-- --------------------------------------- 1. a link needs an owned company
drop policy if exists "portal slice2: own account rows" on public.portal_account_companies;

create policy "portal_account_companies: own account, owned company"
  on public.portal_account_companies for all
  -- Reading: your own link rows (which is how an invited member will see the
  -- companies shared with them).
  using (account_id = auth.uid())
  -- Writing: your own account AND a company you own. A row cannot be used to
  -- claim somebody else's company.
  with check (
    account_id = auth.uid()
    and exists (
      select 1 from public.companies c
      where c.id = portal_account_companies.company_id
        and c.owner_profile_id = auth.uid()
    )
  );

-- --------------------------------- 2. a grant needs owned companies too
create or replace function public.guard_access_grant_companies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_foreign int;
begin
  -- No session: a service-role write (operator, job). Not this guard's business.
  if auth.uid() is null then
    return new;
  end if;

  select count(*) into v_foreign
  from jsonb_array_elements(coalesce(new.data -> 'companies', '[]'::jsonb)) as entry
  where not exists (
    select 1 from public.companies c
    where c.id = (entry ->> 'companyId')::uuid
      and c.owner_profile_id = auth.uid()
  );

  if v_foreign > 0 then
    raise exception 'access grant names a company you do not own'
      using errcode = '42501',
            hint = 'A grant may only name companies owned by the account creating it.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_access_grant_companies on public.portal_access_grants;
create trigger trg_guard_access_grant_companies
  before insert or update on public.portal_access_grants
  for each row execute function public.guard_access_grant_companies();

-- --------------------------------------------- 3. one plans policy, not two
drop policy if exists "plans are publicly readable" on public.plans;
create policy "plans are publicly readable"
  on public.plans for select using (true);

-- ---------------------------------------------------------------- 4. check
-- Every company-scoped table must be owner-scoped, and no policy may be a
-- blanket `true` except the public plan list. Read the USING clause column.
select
  schemaname as schema,
  tablename as table_name,
  policyname as policy,
  cmd as applies_to,
  qual as using_clause
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
