-- ============================================================================
-- CDS Hub — fix the table privileges that are blocking every read and write
--
-- Run these as TWO SEPARATE queries, in order, in:
--   Supabase → CDS Hub project → SQL Editor
--   https://supabase.com/dashboard/project/siivpekcaryeyttszwav/sql/new
--
-- Run them one at a time. The SQL Editor only displays the result of the LAST
-- statement in whatever you paste, so pasting everything at once hides BLOCK 1's
-- answer, which is the part worth reading.
--
-- Background: the REST API rejects reads of agency_data for both the anon and
-- service_role roles with "42501 permission denied for table agency_data".
-- supabase_schema.sql enabled Row Level Security and created policies, but never
-- granted table privileges. These are two different gates. RLS decides WHICH
-- ROWS a role may touch. GRANTs decide whether the role may touch the table AT
-- ALL. With the grants missing, the policies never even get consulted.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 1 — READ ONLY. Changes nothing. Run it first and keep the output.
--
-- Returns a single cell of JSON answering: what data survived, and which roles
-- currently hold privileges. Click the cell, copy it, and send it back.
-- ════════════════════════════════════════════════════════════════════════════

select jsonb_pretty(jsonb_build_object(

  -- Every key stored for the CDS hub, and how many records each holds.
  -- An empty list here means nothing was ever successfully written.
  'cds_data', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'key',     data_key,
             'items',   case when jsonb_typeof(data_value) = 'array'
                             then jsonb_array_length(data_value) end,
             'bytes',   pg_column_size(data_value),
             'updated', updated_at
           ) order by data_key), '[]'::jsonb)
    from public.agency_data
    where agency_id = 'caring-companions-cds'
  ),

  -- Any rows under a DIFFERENT agency_id? Catches a mismatch between the id the
  -- app writes and the id it reads.
  'all_agency_ids', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'agency_id', agency_id, 'keys', n, 'newest', newest
           )), '[]'::jsonb)
    from (select agency_id, count(*) n, max(updated_at) newest
          from public.agency_data group by agency_id) s
  ),

  'delivered_units_rows', (select count(*) from public.delivered_units),

  -- THE KEY DIAGNOSTIC. Expect to see authenticated and service_role listed.
  -- If they are absent, that is the cause of the data loss.
  'privileges_now', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', table_name, 'role', grantee, 'can', p
           ) order by table_name, grantee), '[]'::jsonb)
    from (select table_name, grantee,
                 string_agg(privilege_type, ', ' order by privilege_type) p
          from information_schema.role_table_grants
          where table_schema = 'public'
            and table_name in ('agency_data', 'delivered_units')
          group by table_name, grantee) g
  ),

  -- The RLS policies, for completeness. These already exist; they were never
  -- the problem.
  'rls_policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
             'table', tablename, 'policy', policyname, 'command', cmd
           ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('agency_data', 'delivered_units')
  )

)) as diagnostic;


-- ════════════════════════════════════════════════════════════════════════════
-- BLOCK 2 — THE FIX. Grants privileges only. Touches no data, deletes nothing.
--
-- Select and run everything from here down. It prints the resulting privileges
-- so you can see it worked.
-- ════════════════════════════════════════════════════════════════════════════

-- The hub signs users in, so it acts as `authenticated`. The existing RLS
-- policies still gate every row; this only lets the role reach the table.
grant select, insert, update, delete on public.agency_data     to authenticated;
grant select, insert, update, delete on public.delivered_units to authenticated;

-- service_role bypasses RLS and is what the ghl-sync edge function runs as.
-- Without this, the GoHighLevel sync fails with permission denied.
grant all privileges on public.agency_data     to service_role;
grant all privileges on public.delivered_units to service_role;

-- Deliberately NOT granted to `anon`. Nothing should reach this data without
-- signing in first.

-- Stop this recurring on any table added to this schema later.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all privileges on tables to service_role;

-- Confirm. You should see four rows: both tables for both roles.
select table_name,
       grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as can
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('agency_data', 'delivered_units')
  and grantee in ('authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
