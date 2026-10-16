-- ============================================================================
-- 0002 Client pricing update: 3 plans, choice moves to the payment step.
--   solo       = 1 company, FREE first 12 months, then AED 30/month
--   trio       = up to 3 companies, AED 90/month, no free period
--   enterprise = custom (no self checkout; contact us)
-- Run AFTER 0001. One-time, same process (paste whole file, Run once).
-- ============================================================================

-- plans.id: allow the third plan
alter table public.plans drop constraint plans_id_check;
alter table public.plans
  add constraint plans_id_check check (id in ('solo', 'trio', 'enterprise'));

-- plans.max_companies: NULL = unlimited (enterprise)
alter table public.plans alter column max_companies drop not null;
alter table public.plans drop constraint plans_max_companies_check;
alter table public.plans
  add constraint plans_max_companies_check
  check (max_companies is null or (max_companies between 1 and 3));

-- plans.price_fils: NULL = custom pricing (enterprise)
alter table public.plans alter column price_fils drop not null;
alter table public.plans drop constraint plans_price_fils_check;
alter table public.plans
  add constraint plans_price_fils_check
  check (price_fils is null or price_fils > 0);

-- plans.free_months: free period before first charge (solo = 12)
alter table public.plans
  add column free_months smallint not null default 0 check (free_months >= 0);

insert into public.plans (id, name, max_companies, price_fils, free_months) values
  ('enterprise', 'Enterprise — custom', null, null, 0)
on conflict (id) do update set
  name = excluded.name,
  max_companies = excluded.max_companies,
  price_fils = excluded.price_fils,
  free_months = excluded.free_months;

update public.plans set free_months = 12 where id = 'solo';
update public.plans set free_months = 0 where id = 'trio';

-- subscriptions.plan_id: chosen at the payment step now, so it starts empty.
alter table public.subscriptions alter column plan_id drop not null;

-- Safety net: the company-limit trigger fails closed when no plan is set
-- (join finds no row -> raises 'subscription is not active'). No change needed.
