-- ============================================================================
-- CDS Hub — Caregiver Pool
--
-- Run this ENTIRE file as ONE query in:
--   https://supabase.com/dashboard/project/siivpekcaryeyttszwav/sql/new
--
-- Creates the table behind two things:
--   1. caregiver-list.html — the public "Join our caregiver list" sign-up page
--   2. the Caregiver Pool tab in the hub — where your team screens and matches them
--
-- The applicant fills in the top block. Your staff own the bottom block
-- (status, FCSR, EDL, notes). Applicants can never read or change anything,
-- including their own entry — insert only.
--
-- NOTE ON GRANTS: RLS and GRANTs are two separate gates. This file does both,
-- deliberately, because doing only RLS is exactly what caused the agency_data
-- outage. The NOTIFY at the bottom makes the API pick up the new table.
-- ============================================================================

create table if not exists attendant_pool (
  id                  uuid        default gen_random_uuid() primary key,
  agency_id           text        not null,

  -- ── filled in by the applicant ──────────────────────────────────────────
  first_name          text        not null,
  last_name           text        not null,
  phone               text        not null,
  email               text,
  city                text,
  zip                 text,
  counties            jsonb,       -- ["Greene","Christian"] — where they can work
  availability        jsonb,       -- ["Weekday mornings","Weekends", ...]
  hours_wanted        text,        -- a few hours / part time / full time / anything
  max_miles           int,         -- how far they will drive
  has_transport       boolean,
  experience          text,        -- none / some / experienced / professional
  experience_notes    text,
  cert_cpr            boolean,
  cert_cna            boolean,
  cert_other          text,
  worked_here_before  boolean,
  knows_consumer      text,        -- name of a consumer they already know, if any
  background_ok       boolean,     -- their own attestation, NOT a cleared check
  how_heard           text,
  applicant_notes     text,
  source              text        default 'public',   -- 'public' | 'staff'
  submitted_at        timestamptz default now(),

  -- ── owned by your staff ─────────────────────────────────────────────────
  status              text        default 'new',
    -- new | contacted | screening | cleared | placed | unavailable | declined
  fcsr_status         text,        -- Family Care Safety Registry: pending/clear/hit
  fcsr_date           date,
  edl_status          text,        -- Employee Disqualification List: pending/clear/hit
  edl_date            date,
  last_contacted      date,
  placed_with         text,        -- consumer they were matched to
  staff_notes         text,
  archived            boolean     default false,
  updated_at          timestamptz default now()
);

create index if not exists attendant_pool_agency_idx  on attendant_pool (agency_id);
create index if not exists attendant_pool_status_idx  on attendant_pool (status);

-- Keep updated_at honest so "not contacted in 30 days" means something.
create or replace function attendant_pool_touch() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists attendant_pool_touch_trg on attendant_pool;
create trigger attendant_pool_touch_trg
  before update on attendant_pool
  for each row execute function attendant_pool_touch();

-- ── Row Level Security ─────────────────────────────────────────────────────
alter table attendant_pool enable row level security;

-- The public sign-up page. Anonymous visitors may add themselves, nothing else.
drop policy if exists "public_insert_attendant_pool" on attendant_pool;
create policy "public_insert_attendant_pool"
  on attendant_pool for insert
  to anon
  with check (true);

-- Signed-in staff can do everything.
drop policy if exists "auth_read_attendant_pool" on attendant_pool;
create policy "auth_read_attendant_pool"
  on attendant_pool for select to authenticated using (true);

drop policy if exists "auth_insert_attendant_pool" on attendant_pool;
create policy "auth_insert_attendant_pool"
  on attendant_pool for insert to authenticated with check (true);

drop policy if exists "auth_update_attendant_pool" on attendant_pool;
create policy "auth_update_attendant_pool"
  on attendant_pool for update to authenticated using (true);

drop policy if exists "auth_delete_attendant_pool" on attendant_pool;
create policy "auth_delete_attendant_pool"
  on attendant_pool for delete to authenticated using (true);

-- ── The GRANTs. Without these the policies above are never consulted. ──────
grant usage on schema public to anon, authenticated, service_role;

grant insert                         on public.attendant_pool to anon;
grant select, insert, update, delete on public.attendant_pool to authenticated;
grant all privileges                 on public.attendant_pool to service_role;

-- anon deliberately gets INSERT only. No select, so nobody can read the pool
-- from the public page even though the page uses the publishable key.

-- ── Make the REST API notice the new table ────────────────────────────────
notify pgrst, 'reload schema';

-- ── Verification. Expect 3 rows: anon (INSERT), authenticated (4), ────────
--    service_role (all). Send back whatever this shows.
select grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as can
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name   = 'attendant_pool'
  and grantee in ('anon', 'authenticated', 'service_role')
group by grantee
order by grantee;
