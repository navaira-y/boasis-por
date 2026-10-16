-- ============================================================================
-- 0003 Renewal engine: reminder ledger for subscription renewals.
-- The cron job (GET /api/cron/renewals) sends "your plan ends in N days"
-- emails and pauses access at period end. The unique constraint makes every
-- send idempotent: a retried cron run can never double-email.
-- Run AFTER 0002. One-time, same process (paste whole file, Run once).
-- ============================================================================

create table public.subscription_reminders (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  period_end date not null,                 -- which renewal this reminder is about
  days_before smallint not null,            -- 30/14/7/1, or 0 = "access paused" notice
  channel text not null default 'email',
  recipient text not null,
  sent_at timestamptz not null default now(),
  constraint subscription_reminders_no_dupes
    unique (subscription_id, period_end, days_before)
);
create index subscription_reminders_sub_idx
  on public.subscription_reminders (subscription_id);

-- Server-only: RLS on, no policies, no grants (service role bypasses).
alter table public.subscription_reminders enable row level security;
