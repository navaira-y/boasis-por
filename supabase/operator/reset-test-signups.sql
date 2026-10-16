-- ============================================================================
-- Operator tool: fresh start for test signups.
--
-- Not a migration. Nothing runs this automatically. Paste the whole file into
-- the Supabase SQL editor and press Run when you want to erase every test
-- account and put your own address back on the early-access list, so the
-- waitlist door can be tested from the start.
--
-- What it does, in order:
--   1. shows you the accounts that exist (read the list before deleting)
--   2. deletes those accounts, which cascades through profiles ->
--      subscriptions -> companies -> every child table (all those foreign keys
--      are ON DELETE CASCADE, so nothing is left behind)
--   3. puts your address back to "invited" on the early-access list
--   4. clears the entry trail
--
-- Run it AFTER 0009, so the granted service key can see the trail again.
-- The SQL editor runs as the project owner, so it needs no grants of its own.
-- ============================================================================

-- ---------------------------------------------------------------- 1. look
-- Every account is a test account before launch: read this before deleting.
select id, email, email_confirmed_at, created_at
from auth.users
order by created_at;

-- The early-access list and its state, in case an earlier attempt claimed it.
select id, email, status, claimed_by, claimed_at
from public.early_access_emails
order by created_at;

-- ---------------------------------------------------------------- 2. erase
-- Add or remove addresses here. Only these are deleted; anything else in
-- auth.users survives. Deleting the auth user is the documented way to free an
-- address for a fresh signup (the dashboard does the same thing behind its
-- Delete user button), and Supabase's own tables clean up after it.
delete from auth.users
where lower(email) in (
  'navaira.builds@gmail.com'
);

-- ------------------------------------------------- 3. the list is yours again
update public.early_access_emails
   set status = 'invited',
       claimed_by = null,
       claimed_at = null
 where lower(btrim(email)) = 'navaira.builds@gmail.com';

-- -------------------------------------------------------------- 4. clean slate
delete from public.entry_events;

-- ---------------------------------------------------------------- 5. check
-- Nothing should mention your address any more.
select
  (select count(*) from auth.users) as accounts_left,
  (select count(*) from public.profiles) as profiles_left,
  (select count(*) from public.subscriptions) as subscriptions_left,
  (select count(*) from public.entry_events) as entry_events_left,
  (select status from public.early_access_emails
    where lower(btrim(email)) = 'navaira.builds@gmail.com') as your_list_status;
