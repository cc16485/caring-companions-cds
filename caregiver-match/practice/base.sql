-- Practice mode only: the parts of the live CDS database that Phase 1 builds on,
-- recreated empty so the real Phase 1 SQL can run on top of them.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
create table if not exists public.attendant_pool (
  id uuid primary key default gen_random_uuid(), agency_id text not null, first_name text not null, last_name text not null,
  phone text not null, email text, city text, zip text, counties jsonb, availability jsonb, hours_wanted text, max_miles int,
  has_transport bool, experience text, experience_notes text, cert_cpr bool, cert_cna bool, cert_other text,
  worked_here_before bool, knows_consumer text, background_ok bool, how_heard text, applicant_notes text,
  source text default 'public', submitted_at timestamptz default now(), status text default 'new', fcsr_status text,
  fcsr_date date, edl_status text, edl_date date, last_contacted date, placed_with text, staff_notes text,
  archived bool default false, updated_at timestamptz default now(), has_potential_consumer text,
  consumer_relationship text, consumer_has_medicaid text, show_anonymously bool default true);
create table if not exists public.site_leads (id uuid primary key default gen_random_uuid(), agency_id text, source text,
  first_name text, last_name text, full_name text, phone text, email text, county text, who_needs_care text, has_medicaid text,
  message text, status text default 'new', staff_notes text, last_contacted date, archived bool default false,
  submitted_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.care_plan_preferences (id uuid primary key default gen_random_uuid(), agency_id text, consumer text,
  plan_date date, wellsky_id text, specialist text, daily_tasks jsonb default '[]', flexible_tasks jsonb default '[]', signer_name text,
  sig_consumer text, sig_consumer_date date, sig_staff text, sig_staff_date date, submitted_at timestamptz default now(),
  scheduled bool default false, scheduled_at timestamptz, scheduled_by text);
alter table public.attendant_pool enable row level security;
grant usage on schema public to anon, authenticated;
grant insert on public.attendant_pool to anon;
do $$ begin
  if not exists (select 1 from pg_policies where policyname='public_insert_attendant_pool') then
    create policy public_insert_attendant_pool on public.attendant_pool for insert to anon with check (true);
  end if;
end $$;
-- Stand-in for GoHighLevel contacts (practice only).
create table if not exists public.practice_ghl_contacts (id text primary key, first_name text, last_name text, phone text, email text, tags jsonb);
