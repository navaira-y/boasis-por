-- ============================================================================
-- Operator tool: erase EVERY test account and start from a clean slate.
--
-- Not a migration. Nothing runs this automatically. Paste the whole file into
-- the Supabase SQL editor and press Run.
--
-- Use it before launch, while every account in the database is yours: it
-- deletes every auth user, which cascades through profiles -> subscriptions ->
-- companies -> every child table (all of those foreign keys are ON DELETE
-- CASCADE), and it clears the entry trail.
--
-- It keeps the early-access LIST row for navaira.builds@gmail.com, set back to
-- "invited", so the waitlist door can be tested from the very start. The full
-- launch list is still an operator INSERT near launch.
--
-- Stop running this once a real customer has signed up: it deletes accounts,
-- not just test data.
-- ============================================================================

-- ---------------------------------------------------------------- 1. look
-- Read this before deleting: it should only be addresses you recognise.
select id, email, email_confirmed_at, created_at
from auth.users
order by created_at;

select id, email, status, claimed_by, claimed_at
from public.early_access_emails
order by created_at;

-- ---------------------------------------------------------------- 2. erase
-- Every account, every company, every child row. Deleting the auth user is the
-- documented way to free an address for a fresh signup; the dashboard's Delete
-- user button does the same thing one click at a time.
delete from auth.users;

-- ------------------------------------------------- 3. the list is yours again
update public.early_access_emails
   set status = 'invited',
       claimed_by = null,
       claimed_at = null;

-- Keep only your own address on the list? Replace the line above with:
--   delete from public.early_access_emails
--    where lower(btrim(email)) <> 'navaira.builds@gmail.com';

-- -------------------------------------------------------------- 4. clean slate
delete from public.entry_events;

-- ---------------------------------------------------------------- 5. check
-- Every count should be 0, and your list row should read "invited".
select
  (select count(*) from auth.users) as accounts_left,
  (select count(*) from public.profiles) as profiles_left,
  (select count(*) from public.companies) as companies_left,
  (select count(*) from public.subscriptions) as subscriptions_left,
  (select count(*) from public.entry_events) as entry_events_left,
  (select count(*) from public.early_access_emails) as list_rows,
  (select status from public.early_access_emails
    where lower(btrim(email)) = 'navaira.builds@gmail.com') as your_list_status;
