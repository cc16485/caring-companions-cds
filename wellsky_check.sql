-- The daily CDS check from WellSky (2026-10-19). Safe to run again.
-- One setting: while live is false the check is PRACTICE (shown in the hub, marked
-- Practice, kept out of the 8am email). The report data itself lives in
-- agency_data 'wellskyCheck' (written only by the cds-wellsky server function) and
-- the office's "checked" marks in agency_data 'wellskyReviewed' (written by the hub).
-- No new tables, so no new grants.
insert into public.cds_match_settings (key, value, updated_by)
values ('wellsky_check', jsonb_build_object('live', false, 'started_at', now()), 'wellsky_check.sql')
on conflict (key) do nothing;
