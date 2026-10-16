-- ============================================================================
-- 0009 Service-role grants: the server key can do its job again.
--
-- Why this file exists: Supabase's newer projects no longer hand out table
-- privileges automatically in the public schema. Creating a table is not the
-- same as granting access to it, so a perfectly valid service_role key got
--
--   42501  permission denied for table early_access_emails
--
-- with Supabase's own hint attached: "Grant the required privileges to the
-- current role with: GRANT SELECT ON public.early_access_emails TO
-- service_role;". A revoked key answers 401 "Invalid API key", so a 42501 is
-- never a key problem: it is a grant problem, and this is the grant.
--
-- Scope: service_role only. The visitor-facing roles (anon, authenticated)
-- already have exactly the grants they need from 0001-0007, and the private
-- tables (early_access_emails, entry_events, audit_log, webhook_events) stay
-- revoked from them here, in case default privileges handed anything back.
-- Row level security is still the isolation guarantee for the visitor roles:
-- this file grants no rows, only the right to ask.
--
-- Run AFTER 0008. One-time, same process (paste the whole file, Run once).
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

-- ------------------------------------------------------------- schema access
grant usage on schema public to service_role;

-- --------------------------------------------- what the server key must read
-- The entry check reads the early-access list; the health report reads the
-- entry trail; the renewal sweep reads subscriptions and writes reminders; the
-- activation fallback writes subscriptions; signup writes profiles and the
-- audit log. All of it is one role, so the grant is stated once.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tables and functions added by later migrations get the same treatment, so
-- this cannot silently break again after the next schema change.
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
-- The visitor roles get nothing by default on purpose: a new table is
-- invisible until a migration grants it and a policy scopes it.

-- ------------------------------------------- privacy, stated out loud again
-- 0008 revoked these, and a grant-all above cannot undo it because it targets
-- service_role only. Repeated here so the file reads as the complete rule.
revoke all on public.early_access_emails from anon, authenticated;
revoke all on public.entry_events from anon, authenticated;
revoke all on public.audit_log from anon, authenticated;
revoke all on public.webhook_events from anon, authenticated;

-- ---------------------------------------- row level security, belt and braces
-- Enabling is idempotent and cannot turn a policy on or off. Every app table is
-- listed, so a table that somehow arrived without RLS is covered now.
alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.companies enable row level security;
alter table public.webhook_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.subscription_reminders enable row level security;
alter table public.company_people enable row level security;
alter table public.company_offices enable row level security;
alter table public.company_documents enable row level security;
alter table public.company_cards enable row level security;
alter table public.company_history enable row level security;
alter table public.company_audit enable row level security;
alter table public.portal_account_companies enable row level security;
alter table public.portal_onboarding_starts enable row level security;
alter table public.portal_onboarding_progress enable row level security;
alter table public.portal_tasks enable row level security;
alter table public.portal_reminder_emails enable row level security;
alter table public.portal_waitlist enable row level security;
alter table public.portal_account_people enable row level security;
alter table public.portal_roles enable row level security;
alter table public.portal_access_grants enable row level security;
alter table public.early_access_emails enable row level security;
alter table public.entry_events enable row level security;

-- --------------------------------------------------------------- what now?
-- This query prints the answer instead of making you guess. Every row must say
-- true for the service key, and the four private tables must say false for the
-- public roles.
select
  c.relname as table_name,
  has_table_privilege('service_role', c.oid, 'SELECT') as service_can_read,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_can_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as member_can_read,
  c.relrowsecurity as rls_on
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
