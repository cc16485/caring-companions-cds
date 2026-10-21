-- The automatic OIG exclusion check for CDS attendants (2026-10-21, Samantha: OIG should
-- run itself). Attendants must not be on the OIG exclusion list (LEIE) before hire, and
-- are rechecked every month after.
--
-- The list is OIG's free monthly file UPDATED.csv (refreshed by the 10th). It has no SSNs,
-- so matching is by name and birth date. A possible match always goes to a person: the
-- check never clears or fails anyone on its own.
--
-- Server function cds-oig (logic: supabase/functions/_shared/office/oig.js):
--   import       on the 11th: downloads the file, replaces cds_oig_leie, logs cds_oig_runs
--   recheck_all  after the import: every active attendant, results in cds_oig_results
--   check        { people: [...] }: the attendant packet calls this at Step 1
--
-- PRACTICE MODE: setting oig_check.live starts false. While false it imports and checks
-- and saves every result, but nothing reaches the office as a to-do.
--
-- Only the server reads the imported list. Signed-in hub staff may read results and runs.
-- Safe to run twice.

create table if not exists public.cds_oig_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running','done','failed')),
  file_month text,                 -- 'YYYY-MM', from the file's Last-Modified date
  row_count int,                   -- people on the list (businesses are left out)
  error text
);

create table if not exists public.cds_oig_leie (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.cds_oig_runs(id) on delete cascade,
  last_name text not null,
  first_name text,
  middle_name text,
  dob date,
  city text,
  state text,
  specialty text,
  excl_type text,
  excl_date date,
  reinstate_date date,
  last_keys text[] not null,       -- normalized last name (and its parts) for lookup
  first_key text
);
create index if not exists cds_oig_leie_last_keys on public.cds_oig_leie using gin (last_keys);
create index if not exists cds_oig_leie_run on public.cds_oig_leie (run_id);

create table if not exists public.cds_oig_results (
  id uuid primary key default gen_random_uuid(),
  person_ref text not null,        -- e.g. 'attendant:<id>' or 'packet:<id>'
  person jsonb not null,           -- the name, birth date and state that were checked
  source text not null default 'check' check (source in ('check','recheck')),
  run_id uuid references public.cds_oig_runs(id) on delete set null,
  file_month text,
  checked_at timestamptz not null default now(),
  result text not null check (result in ('clear','possible_match')),
  matches jsonb not null default '[]'::jsonb,
  reviewed_by text,
  reviewed_at timestamptz,
  review text check (review in ('not_them','is_them'))
);
create index if not exists cds_oig_results_ref on public.cds_oig_results (person_ref, checked_at desc);

alter table public.cds_oig_runs enable row level security;
alter table public.cds_oig_leie enable row level security;
alter table public.cds_oig_results enable row level security;
revoke all on public.cds_oig_runs, public.cds_oig_leie, public.cds_oig_results from anon, authenticated;
grant select on public.cds_oig_runs, public.cds_oig_results to authenticated;
drop policy if exists cds_oig_runs_staff_read on public.cds_oig_runs;
create policy cds_oig_runs_staff_read on public.cds_oig_runs for select to authenticated using (true);
drop policy if exists cds_oig_results_staff_read on public.cds_oig_results;
create policy cds_oig_results_staff_read on public.cds_oig_results for select to authenticated using (true);
grant all on public.cds_oig_runs, public.cds_oig_leie, public.cds_oig_results to service_role;

insert into public.cds_match_settings (key, value, updated_by)
values ('oig_check', jsonb_build_object('live', false), 'oig_check.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';
