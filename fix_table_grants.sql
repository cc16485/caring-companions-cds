-- ============================================================================
-- CDS Hub — diagnose the data loss, then fix the table privileges
-- Run in: Supabase → CDS Hub project → SQL Editor → New query → Run
--
-- Why: as of 2026-07-29 the REST API rejects reads of agency_data for BOTH
-- the anon and service_role roles with:
--     42501  permission denied for table agency_data
--     hint:  GRANT SELECT ON public.agency_data TO anon;
-- Missing GRANTs are separate from Row Level Security. RLS decides WHICH rows a
-- role may touch; GRANTs decide whether the role may touch the table at all.
-- supabase_schema.sql enabled RLS and created policies but never granted table
-- privileges, so every read and write can fail regardless of the policies.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────
-- PART 1 — READ ONLY. What actually survived? Run this first.
-- ─────────────────────────────────────────────────────────────────────

-- Every stored key, how big it is, and how many records it holds.
-- If this returns no rows, nothing was ever successfully written.
select data_key,
       jsonb_typeof(data_value) as kind,
       case when jsonb_typeof(data_value) = 'array'
            then jsonb_array_length(data_value) end as items,
       pg_column_size(data_value) as bytes,
       updated_at
from public.agency_data
where agency_id = 'caring-companions-cds'
order by data_key;

-- Any rows at all, under any agency_id? (catches an agency_id mismatch)
select agency_id, count(*) as keys, max(updated_at) as newest
from public.agency_data
group by agency_id;

select count(*) as delivered_unit_rows from public.delivered_units;

-- Which roles can touch these tables today? This is the key diagnostic.
-- Expect to see authenticated and service_role. If they are absent, that is
-- the cause of the loss: the hub could never write, and never read back.
select table_name,
       grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('agency_data', 'delivered_units')
group by table_name, grantee
order by table_name, grantee;


-- ─────────────────────────────────────────────────────────────────────
-- PART 2 — THE FIX. Safe to run: grants privileges, touches no data.
-- ─────────────────────────────────────────────────────────────────────

-- The hub signs users in, so it acts as `authenticated`. The existing RLS
-- policies still gate every row; these grants only let the role reach the table.
grant select, insert, update, delete on public.agency_data     to authenticated;
grant select, insert, update, delete on public.delivered_units to authenticated;

-- service_role bypasses RLS and is what the ghl-sync edge function runs as.
-- Without this, the GoHighLevel sync fails with permission denied.
grant all privileges on public.agency_data     to service_role;
grant all privileges on public.delivered_units to service_role;

-- Deliberately NOT granted to `anon`. Nothing should read this data
-- without signing in first.

-- Keep future tables in this schema working the same way.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all privileges on tables to service_role;


-- ─────────────────────────────────────────────────────────────────────
-- PART 3 — Confirm the fix took. Re-run the grants query.
-- ─────────────────────────────────────────────────────────────────────
select table_name,
       grantee,
       string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('agency_data', 'delivered_units')
  and grantee in ('authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
