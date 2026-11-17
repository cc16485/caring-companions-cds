-- Never clocked out texts (2026-11-17, Samantha). Switch starts OFF (practice).
-- The schedule: hourly at 20 past; the function itself only acts 9am to 6pm Central.
insert into public.cds_match_settings (key, value, updated_by)
values ('open_shift_texts', jsonb_build_object('live', false), 'setup 2026-11-17')
on conflict (key) do nothing;

-- Cron uses the same CDS_JOB_SECRET as cds-comms (read from its existing job).
-- select cron.schedule('cds-open-shifts', '20 * * * *', $$ select net.http_post(
--   url := 'https://siivpekcaryeyttszwav.supabase.co/functions/v1/cds-open-shifts',
--   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<CDS_JOB_SECRET>'),
--   body := '{}'::jsonb, timeout_milliseconds := 60000) $$);
-- Undo: select cron.unschedule('cds-open-shifts'); delete from public.cds_match_settings where key = 'open_shift_texts';
