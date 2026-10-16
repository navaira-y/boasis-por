-- ============================================================================
-- 0011 Remove the unused self-insert path on subscriptions.
--
-- 0005 granted signed-in visitors the right to insert their OWN subscriptions
-- row with status 'pending'. That was for a flow where signup wrote a pending
-- row before activation. The current signup does not: the free year is granted
-- by public.activate_free_year() inside the database (0008), and the only
-- fallback writes with the service key (apps/web/lib/activation.ts).
--
-- So the grant is an unused write path. It is harmless today, because a pending
-- row unlocks nothing: the gate needs status 'active', and the company-limit
-- trigger refuses anything that is not active. But an unused write path on the
-- billing table is exactly the kind of thing that quietly becomes a hole, and
-- removing it costs nothing.
--
-- Reading subscriptions is untouched (the gate and the billing page need it),
-- and the service role keeps every right it has from 0009, so the RPC and the
-- service-key fallback both keep working.
--
-- Run AFTER 0010. One-time, same process (paste the whole file, Run once).
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

drop policy if exists "subscriptions: owner can insert own pending"
  on public.subscriptions;

revoke insert on public.subscriptions from authenticated;

-- ---------------------------------------------------------------- check
-- insert_allowed must be false for the visitor roles and true for the server.
select
  has_table_privilege('anon', 'public.subscriptions', 'INSERT') as anon_can_insert,
  has_table_privilege('authenticated', 'public.subscriptions', 'INSERT') as member_can_insert,
  has_table_privilege('service_role', 'public.subscriptions', 'INSERT') as service_can_insert,
  has_table_privilege('authenticated', 'public.subscriptions', 'SELECT') as member_can_read;
