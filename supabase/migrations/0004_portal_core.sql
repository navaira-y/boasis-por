-- ============================================================================
-- 0004 Portal interior (team UI) real data, slice 1: companies, offices,
-- people, documents, cards, field history, audit trail.
--
-- Pattern: document-on-Postgres. Each record keeps its full team-schema
-- document in a data/facts JSONB column (validated client-side by the same
-- Zod schemas the mock uses), plus a few extracted columns for listing and
-- uniqueness. No per-field tables: their CompanyFacts has 100+ fields and
-- evolves with the product.
--
-- Ownership: everything hangs under companies.owner_profile_id (RLS owner
-- only, matching the existing companies policy). Deleting a company
-- cascades to every child row — the mock's removeCompany behaviour.
-- Run AFTER 0003. One-time, same process (paste whole file, Run once).
-- ============================================================================

-- ---------------------------------------------------------- companies (+) --
alter table public.companies
  add column if not exists facts jsonb not null default '{}'::jsonb,
  add column if not exists trade_name text,
  add column if not exists licence_expiry date;
create index if not exists companies_licence_idx
  on public.companies (authority_id, licence_number);

-- Privacy-preserving duplicate check (mock licenceTaken): answers yes/no
-- only across ALL owners; who holds the licence is never revealed, so it
-- runs definer (RLS would hide other owners' rows from the caller).
create or replace function public.licence_taken(p_authority text, p_licence text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.companies
    where authority_id = p_authority
      and licence_number is not null
      and lower(regexp_replace(licence_number, '\s+', '', 'g'))
        = lower(regexp_replace(coalesce(p_licence, ''), '\s+', '', 'g'))
  );
$$;
grant execute on function public.licence_taken(text, text) to authenticated;

-- ----------------------------------------------------------------- people --
create table public.company_people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index company_people_company_idx on public.company_people (company_id);

-- ----------------------------------------------------------------- offices --
create table public.company_offices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index company_offices_company_idx on public.company_offices (company_id);

-- --------------------------------------------------------------- documents --
-- Metadata only in slice 1 (title, versions, extracted values). File bytes
-- move to a Supabase Storage vault bucket in the documents slice.
create table public.company_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index company_documents_company_idx on public.company_documents (company_id);

-- ------------------------------------------------------------------- cards --
-- Card ids are TEXT: computed cards carry the id packages/rules gave them,
-- which is not always a uuid. A card has no row until someone ticks it.
create table public.company_cards (
  id text primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index company_cards_company_idx on public.company_cards (company_id);

-- ----------------------------------------------------------------- history --
-- Append-only field history (spec 5.1). SQL NULL encodes JSON null, matching
-- the schema's JsonValue. No updates/deletes for app users (no policies).
create table public.company_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  subject_kind text not null check (subject_kind in ('company', 'office', 'person')),
  subject_id text not null,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  kind text not null check (kind in ('created', 'correction', 'amendment', 'from-document')),
  on_date date not null,
  who jsonb not null,
  document_id text,
  created_at timestamptz not null default now()
);
create index company_history_company_idx
  on public.company_history (company_id, on_date desc);

-- ------------------------------------------------------------------- audit --
-- Append-only audit trail (spec 7.3). Reference ids are plain text with no
-- foreign keys: the trail must keep naming records even after they change.
create table public.company_audit (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null,
  summary text not null,
  when_at timestamptz not null default now(),
  who jsonb not null,
  card_id text,
  person_id text,
  document_id text,
  created_at timestamptz not null default now()
);
create index company_audit_company_idx
  on public.company_audit (company_id, when_at desc);

-- --------------------------------------------------------------------- RLS --
-- Owner-only through the parent company, mirroring the companies policy.
alter table public.company_people enable row level security;
alter table public.company_offices enable row level security;
alter table public.company_documents enable row level security;
alter table public.company_cards enable row level security;
alter table public.company_history enable row level security;
alter table public.company_audit enable row level security;

grant select, insert, update, delete on public.company_people to authenticated;
grant select, insert, update, delete on public.company_offices to authenticated;
grant select, insert, update, delete on public.company_documents to authenticated;
grant select, insert, update, delete on public.company_cards to authenticated;
-- history + audit: read and append only (never update/delete).
grant select, insert on public.company_history to authenticated;
grant select, insert on public.company_audit to authenticated;

create policy "portal child: owner via company"
  on public.company_people for all
  using (exists (
    select 1 from public.companies c
    where c.id = company_people.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_people.company_id and c.owner_profile_id = auth.uid()
  ));

create policy "portal child: owner via company"
  on public.company_offices for all
  using (exists (
    select 1 from public.companies c
    where c.id = company_offices.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_offices.company_id and c.owner_profile_id = auth.uid()
  ));

create policy "portal child: owner via company"
  on public.company_documents for all
  using (exists (
    select 1 from public.companies c
    where c.id = company_documents.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_documents.company_id and c.owner_profile_id = auth.uid()
  ));

create policy "portal child: owner via company"
  on public.company_cards for all
  using (exists (
    select 1 from public.companies c
    where c.id = company_cards.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_cards.company_id and c.owner_profile_id = auth.uid()
  ));

create policy "portal child: owner via company"
  on public.company_history for all
  using (exists (
    select 1 from public.companies c
    where c.id = company_history.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_history.company_id and c.owner_profile_id = auth.uid()
  ));

create policy "portal child: owner via company"
  on public.company_audit for all
  using (exists (
    select 1 from public.companies c
    where c.id = company_audit.company_id and c.owner_profile_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.companies c
    where c.id = company_audit.company_id and c.owner_profile_id = auth.uid()
  ));
