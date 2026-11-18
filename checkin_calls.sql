-- Monthly check-in calls (2026-11-17, Samantha). Switch starts OFF: nobody is called until she turns it on.
insert into public.cds_match_settings (key, value, updated_by)
values ('checkin_calls', jsonb_build_object('live', false), 'setup 2026-11-17')
on conflict (key) do nothing;

-- The schedule: hourly at 35 past; the job itself only starts calls on the 1st to the 7th, 10am to 5pm Central.
-- Cron uses the same CDS_JOB_SECRET as cds-comms (read from its existing job by the Desktop step).
-- Undo: select cron.unschedule('cds-checkin-calls'); delete from public.cds_match_settings where key = 'checkin_calls';
