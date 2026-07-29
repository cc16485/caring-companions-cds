-- ============================================================================
-- CDS Hub — grant table privileges, then force the API to notice
--
-- Run this ENTIRE file as ONE query in:
--   https://supabase.com/dashboard/project/siivpekcaryeyttszwav/sql/new
--
-- Symptom it fixes: every read and write of agency_data fails with
--   42501  permission denied for table agency_data
-- supabase_schema.sql enabled Row Level Security and created policies but never
-- granted table privileges. Those are two separate gates. RLS decides WHICH ROWS
-- a role may touch; GRANTs decide whether it may touch the table AT ALL. With the
-- grants missing the policies are never even consulted.
--
-- Why a first attempt can appear to work and change nothing: the REST API
-- (PostgREST) keeps a cached picture of the schema and its permissions. After
-- changing grants it has to be told to reload, which is the NOTIFY at the bottom.
-- Without it you can grant correctly and still get 42501 from the API.
--
-- The last statement returns a result, so whatever the editor displays IS the
-- verification. Send that back.
-- ============================================================================

-- Confirm we are in the right project before changing anything. The CDS hub
-- writes under this agency_id; if the count below errors, you are in the wrong
-- project (you have four).
select current_database() as database, current_user as running_as;

-- ---------------------------------------------------------------------------
-- The grants. The hub signs users in, so it acts as `authenticated`.
-- The existing RLS policies still gate every row.
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on public.agency_data     to authenticated;
grant select, insert, update, delete on public.delivered_units to authenticated;

-- service_role bypasses RLS and is what the ghl-sync edge function runs as.
grant all privileges on public.agency_data     to service_role;
grant all privileges on public.delivered_units to service_role;

-- Deliberately NOT granted to `anon`: nothing should reach this data without
-- signing in first.

-- Stop this recurring on any table added to this schema later.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all privileges on tables to service_role;

-- ---------------------------------------------------------------------------
-- Make the REST API pick up the new permissions. This is the step most likely
-- missing from the first attempt.
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Verification. Expect FOUR rows: agency_data and delivered_units, each listed
-- for authenticated and for service_role. Fewer rows means a grant did not land.
-- ---------------------------------------------------------------------------
select table_name,
       grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as can
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('agency_data', 'delivered_units')
  and grantee in ('authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
