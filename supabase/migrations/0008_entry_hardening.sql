-- ============================================================================
-- 0008 Entry hardening: the waitlist lookup cannot miss, the free year is
-- granted by the database itself, and the entry trail is kept.
--
-- 1. early_access_emails gets a normalised address column. Migration 0007
--    made the list unique on lower(email) but the signup check compared a
--    lower-cased address with the raw column, so a row stored with different
--    capitalisation was found by neither and a listed founder was quietly sent
--    to the plans door. Both the lookup and the index now agree.
--    Nothing is deleted here: the old unique index stays, new duplicates were
--    already impossible, and this migration adds a plain index on the
--    normalised value.
--
-- 2. public.activate_free_year() lets a VERIFIED account start its own first
--    free year, once, with no service key involved. The free year is what
--    every verified account gets, so granting it is not self-activation of
--    anything valuable, and the function still re-checks the verified inbox in
--    the database rather than trusting the app. It refuses when the year was
--    already used, and it never touches a paid or cancelled subscription.
--
-- 3. public.entry_events keeps the entry trail (which door, which code, when),
--    readable by the operator only. Full addresses stay in there; the app logs
--    masked ones.
--
-- Run AFTER 0007. One-time, same process (paste the whole file, Run once).
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

-- ------------------------------------------------ 1. the waitlist, normalised
alter table public.early_access_emails
  add column if not exists email_norm text
  generated always as (lower(btrim(email))) stored;

create index if not exists early_access_emails_email_norm_ix
  on public.early_access_emails (email_norm);

-- Belt and braces: the list is service-role only, and it says so out loud.
alter table public.early_access_emails enable row level security;
revoke all on public.early_access_emails from anon, authenticated;

comment on column public.early_access_emails.email_norm is
  'lower(trim(email)): what the signup door compares against. Never edit by hand.';

-- ------------------------------------------------------- 2. the free year
alter table public.subscriptions
  add column if not exists free_year_used_at timestamptz;

comment on column public.subscriptions.free_year_used_at is
  'Set the once-per-account the free year starts. Never cleared, so the gift cannot be taken twice.';

create or replace function public.activate_free_year()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_verified timestamptz;
  v_months smallint;
  v_sub record;
  v_start timestamptz := now();
  v_end timestamptz;
begin
  if v_uid is null then
    raise exception 'no session' using errcode = 'P0002';
  end if;

  -- The inbox is the authority for the free year, and only the database sees
  -- the raw truth about it.
  select email_confirmed_at into v_verified from auth.users where id = v_uid;
  if v_verified is null then
    raise exception 'email not verified' using errcode = 'P0003';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'account not created' using errcode = 'P0004';
  end if;

  select free_months into v_months
  from public.plans where id = 'solo' and active;
  if v_months is null then
    raise exception 'solo plan missing' using errcode = 'P0005';
  end if;

  select id, status, provider, plan_id, current_period_start, current_period_end,
         activated_at, free_year_used_at
    into v_sub
    from public.subscriptions
   where profile_id = v_uid;

  if found then
    if v_sub.free_year_used_at is not null then
      return jsonb_build_object(
        'status', v_sub.status,
        'plan_id', v_sub.plan_id,
        'period_start', v_sub.current_period_start,
        'period_end', v_sub.current_period_end,
        'source', 'already-used'
      );
    end if;
    -- A paid plan in force is never overwritten by a gift.
    if v_sub.status = 'active' and coalesce(v_sub.provider, '') <> 'free' then
      return jsonb_build_object(
        'status', v_sub.status,
        'plan_id', v_sub.plan_id,
        'period_start', v_sub.current_period_start,
        'period_end', v_sub.current_period_end,
        'source', 'paid-plan-kept'
      );
    end if;
  end if;

  v_end := v_start + make_interval(months => v_months);

  if found then
    update public.subscriptions
       set plan_id = 'solo',
           status = 'active',
           provider = 'free',
           current_period_start = v_start,
           current_period_end = v_end,
           activated_at = coalesce(activated_at, v_start),
           free_year_used_at = v_start
     where profile_id = v_uid;
  else
    insert into public.subscriptions
      (profile_id, plan_id, status, provider, current_period_start, current_period_end,
       activated_at, free_year_used_at)
    values
      (v_uid, 'solo', 'active', 'free', v_start, v_end, v_start, v_start);
  end if;

  insert into public.audit_log (actor_profile_id, action, entity, entity_id, meta)
  values (v_uid, 'subscription.free_year_started', 'subscription', v_uid::text,
          jsonb_build_object('plan', 'solo', 'months', v_months, 'period_end', v_end));

  return jsonb_build_object(
    'status', 'active',
    'plan_id', 'solo',
    'period_start', v_start,
    'period_end', v_end,
    'source', 'free-year'
  );
end;
$$;

revoke all on function public.activate_free_year() from public;
revoke all on function public.activate_free_year() from anon;
grant execute on function public.activate_free_year() to authenticated;

-- ---------------------------------------------------- 3. the entry trail
create table if not exists public.entry_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,
  code text,
  email text,
  meta jsonb not null default '{}'::jsonb
);
create index if not exists entry_events_at_ix on public.entry_events (at desc);
create index if not exists entry_events_kind_ix on public.entry_events (kind, at desc);

alter table public.entry_events enable row level security;
revoke all on public.entry_events from anon, authenticated;

comment on table public.entry_events is
  'Who came through which door and what the setup answered. Operator read only. Support one-liner: select at, kind, code, email, meta from public.entry_events order by at desc limit 20;';
