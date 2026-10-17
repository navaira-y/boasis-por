-- Authenticator MFA, enforced below the UI. Apply after 0012.
-- No customer rows are deleted or changed. Existing owner policies remain in
-- force; restrictive policies add a second condition, never broaden access.
-- Accounts without a verified factor keep the existing entry/onboarding flow.
-- Auth owns factor secrets and verification. Never store them in public tables.
begin;

create schema if not exists boasis_private;
revoke all on schema boasis_private from public, anon, authenticated, service_role;

create or replace function public.mfa_session_allowed()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
  );
$$;
revoke all on function public.mfa_session_allowed() from public, anon;
grant execute on function public.mfa_session_allowed() to authenticated, service_role;

-- Every browser-readable/writable private table. Public plans stay public;
-- server-only ledgers and the private company lock remain default-deny.
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'profiles', 'subscriptions', 'companies', 'subscription_reminders',
    'company_offices', 'company_people', 'company_documents', 'company_cards',
    'company_history', 'company_audit', 'portal_account_companies',
    'portal_onboarding_starts', 'portal_onboarding_progress', 'portal_tasks',
    'portal_reminder_emails', 'portal_waitlist', 'portal_account_people',
    'portal_roles', 'portal_access_grants'
  ] loop
    execute format('drop policy if exists "authenticator: verified session" on public.%I', v_table);
    execute format(
      'create policy "authenticator: verified session" on public.%I as restrictive for all to authenticated using ((select public.mfa_session_allowed())) with check ((select public.mfa_session_allowed()))',
      v_table
    );
  end loop;
end;
$$;

-- These security-definer RPCs bypass RLS internally, so they need the same
-- check explicitly. Preserve their existing entitlement/concurrency code in
-- a non-exposed schema. No duplicate business rule and no edits to applied SQL.
do $$
begin
  if to_regprocedure('boasis_private.activate_free_year_base()') is null then
    alter function public.activate_free_year() set schema boasis_private;
    alter function boasis_private.activate_free_year() rename to activate_free_year_base;
  end if;
  if to_regprocedure('boasis_private.company_creation_access_base()') is null then
    alter function public.company_creation_access() set schema boasis_private;
    alter function boasis_private.company_creation_access() rename to company_creation_access_base;
  end if;
end;
$$;
revoke all on function boasis_private.activate_free_year_base() from public, anon, authenticated, service_role;
revoke all on function boasis_private.company_creation_access_base() from public, anon, authenticated, service_role;

create or replace function public.activate_free_year()
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mfa_session_allowed() then
    raise exception 'Authenticator verification is required.' using errcode = '42501';
  end if;
  return boasis_private.activate_free_year_base();
end;
$$;
create or replace function public.company_creation_access()
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not public.mfa_session_allowed() then
    raise exception 'Authenticator verification is required.' using errcode = '42501';
  end if;
  return boasis_private.company_creation_access_base();
end;
$$;
revoke all on function public.activate_free_year() from public, anon;
revoke all on function public.company_creation_access() from public, anon;
grant execute on function public.activate_free_year() to authenticated, service_role;
grant execute on function public.company_creation_access() to authenticated, service_role;

-- Enrollment fails closed until this installation check succeeds. It reveals
-- only installation metadata, never somebody else's factors or subscription.
create or replace function public.mfa_guard_ready()
returns boolean language sql stable security definer set search_path = ''
as $$
  select (
    select count(*) = 19 from pg_catalog.pg_policies
    where schemaname = 'public' and policyname = 'authenticator: verified session'
      and permissive = 'RESTRICTIVE' and cmd = 'ALL'
      and roles = array['authenticated']::name[]
      and qual like '%mfa_session_allowed%'
      and with_check like '%mfa_session_allowed%'
  )
  and not pg_catalog.has_schema_privilege('authenticated', 'boasis_private', 'USAGE')
  and not pg_catalog.has_function_privilege('authenticated', 'boasis_private.activate_free_year_base()', 'EXECUTE')
  and not pg_catalog.has_function_privilege('authenticated', 'boasis_private.company_creation_access_base()', 'EXECUTE')
  and not pg_catalog.has_function_privilege('anon', 'public.mfa_session_allowed()', 'EXECUTE')
  and pg_catalog.pg_get_functiondef('public.activate_free_year()'::regprocedure) like '%mfa_session_allowed%'
  and pg_catalog.pg_get_functiondef('public.company_creation_access()'::regprocedure) like '%mfa_session_allowed%';
$$;
revoke all on function public.mfa_guard_ready() from public, anon;
grant execute on function public.mfa_guard_ready() to authenticated, service_role;

commit;

select
  public.mfa_guard_ready() as mfa_guard_ready,
  not has_function_privilege('anon', 'public.mfa_session_allowed()', 'EXECUTE') as anonymous_factor_lookup_denied,
  not has_schema_privilege('authenticated', 'boasis_private', 'USAGE') as original_rpcs_private,
  pg_get_functiondef('public.activate_free_year()'::regprocedure) like '%mfa_session_allowed%' as activation_guarded,
  pg_get_functiondef('public.company_creation_access()'::regprocedure) like '%mfa_session_allowed%' as company_allowance_guarded;
