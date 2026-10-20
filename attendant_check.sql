-- The daily attendant check against WellSky (2026-10-20). The Attendants page shows it as soon as
-- the hub page is live; this setting only decides whether it also goes in the 8am email.
-- Practice (live = false) until Samantha approves the wording. Safe to run twice.
insert into public.cds_match_settings (key, value, updated_by)
values ('attendant_check', jsonb_build_object('live', false), 'attendant_check.sql')
on conflict (key) do nothing;
