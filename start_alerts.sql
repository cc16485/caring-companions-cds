-- The start-date alert (2026-11-26, Samantha: "big alerts to Katlin and Samantha when a start date from the state is
-- put in after state calls us"). One setting; the cds-lead-alert job (every 2 minutes) does the work (start-alert.js).
-- live: on (her ask). The first run only remembers the start dates already on file, so nobody gets old alerts.
-- Recipients: Samantha (email and text, her phone copied from lead_alerts so no phone number is in this file) and
-- Katlin (email, plus an item at the top of her CDS to-do). Texts wait for 7 AM to 8 PM Missouri time.
-- Safe to run twice: an existing setting is left alone.
insert into public.cds_match_settings (key, value, updated_by)
select 'start_alerts', jsonb_build_object(
  'live', true,
  'text_from', 7, 'text_until', 20,
  'my_week', true,
  'seen', '{}'::jsonb, 'pending', '[]'::jsonb,
  'recipients', jsonb_build_array(
    jsonb_build_object('name', 'Samantha', 'email', 'samantha@mo-care.com',
      'phone', (select r->>'phone' from public.cds_match_settings s, jsonb_array_elements(s.value->'recipients') r
                 where s.key = 'lead_alerts' and lower(r->>'name') like 'samantha%' and coalesce(r->>'phone','') <> '' limit 1),
      'todo', false),
    jsonb_build_object('name', 'Katlin', 'email', 'katlin@mo-care.com', 'phone', null, 'todo', true))), 'start_alerts.sql'
on conflict (key) do nothing;

notify pgrst, 'reload schema';
