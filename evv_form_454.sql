-- 454 · CDS EVV FORM SAVES AGAIN + EMAILS THE OFFICE (Samantha, 2026-10-05).
-- Found: every submission of hub.caringcds.com/evv-form was refused ("permission denied for table evv_submissions"):
-- the table had its access rules but never the table permissions (the same gap fix_table_grants.sql closed for
-- agency_data and delivered_units in July). So no form ever reached the hub's EVV Corrections list.
--   anon (the public form, no sign-in): may ADD a form for this agency, never read, change or delete one.
--   authenticated (office staff in the hub): read, mark processed, tidy.   service_role: everything (the email helper).
-- Plus notified_at: when the office email went (evv-notify claims it before sending, so a form is emailed once).
-- Safe to run twice. Nothing is dropped or rewritten except the one insert rule, which is recreated tighter.
begin;
grant usage on schema public to anon, authenticated, service_role;
-- 454b: first run stopped at its check. Start clean: take EVERY table permission off the public form (including any
-- older TRUNCATE, which ignores row rules, REFERENCES or TRIGGER), then give back only "add a form". Staff get exactly
-- read, add, update, delete (no TRUNCATE).
revoke all privileges on public.evv_submissions from anon;
grant insert on public.evv_submissions to anon;
revoke all privileges on public.evv_submissions from authenticated;
grant select, insert, update, delete on public.evv_submissions to authenticated;
grant all privileges on public.evv_submissions to service_role;
alter table public.evv_submissions enable row level security;
drop policy if exists "public_insert_evv_submissions" on public.evv_submissions;
create policy "public_insert_evv_submissions" on public.evv_submissions for insert to anon
  with check (agency_id = 'caring-companions-cds' and coalesce(processed, false) = false);
alter table public.evv_submissions add column if not exists notified_at timestamptz;
commit;
notify pgrst, 'reload schema';
