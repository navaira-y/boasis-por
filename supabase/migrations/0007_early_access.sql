-- 0007: early-access entry flow (Oct 3 meeting).
--
-- boasis.ae/early-access collects emails on the marketing site; days before
-- launch the operator imports them here. A listed email claims portal access
-- by verifying the inbox (OTP, unchanged) + creating a password — no payment,
-- Solo-level access (1 company, free year), same as the free tier.
--
-- Import (operator, Supabase SQL editor — paste the final list):
--   insert into public.early_access_emails (email)
--   select lower(trim(v.value)) from (values ('a@x.com'), ('b@y.com')) as v(value)
--   on conflict do nothing;

create table if not exists public.early_access_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'boasis.ae/early-access',
  status text not null default 'invited' check (status in ('invited', 'claimed')),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists early_access_emails_email_ux
  on public.early_access_emails (lower(email));

alter table public.early_access_emails enable row level security;
-- No policies on purpose: the list is readable/writable ONLY via the service
-- key (server actions). The signup membership check runs server-side and is
-- rate-limited; the OTP step still guards account creation, so learning that
-- an address is listed grants nothing by itself.

-- Marks accounts that entered through the waitlist door (free, no plan choice).
alter table public.profiles
  add column if not exists is_early_access boolean not null default false;

-- Plan the user CHOSE while no gateway is configured. Access stays
-- Solo-level (1 company) until payment exists; pending_plan is honored at
-- pay time (Ziina) instead of granting unpaid companies.
alter table public.subscriptions
  add column if not exists pending_plan text;
