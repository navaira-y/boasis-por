-- ============================================================================
-- 0005 Let owners insert their OWN pending subscription row.
--
-- Why: signup must not depend on the service key. A pending row is worthless
-- without activation, and activation (update) stays server-only — there is
-- still no update/delete policy — so the pay gate is untouched. One row per
-- profile is enforced by the primary key.
-- Run AFTER 0004. One-time, same process (paste whole file, Run once).
-- ============================================================================

grant insert on public.subscriptions to authenticated;

create policy "subscriptions: owner can insert own pending"
  on public.subscriptions for insert
  with check (auth.uid() = profile_id and status = 'pending');
