-- CDS new-lead alerts and the CDS morning email (2026-10-19, Samantha: "Plan the CDS
-- new-lead alerts and morning email first", then "build it in practice mode").
--
-- 1. Every lead from caringcds.com or findcdscaregivers.com (table site_leads) gets
--    an email to the office at once, and a text in text hours (weekdays 8am to 6pm
--    Central). A lead outside those hours gets its text when they open.
-- 2. If nobody has called after 30 minutes of text hours, one reminder text.
-- 3. A morning email at 8am Central on weekdays, the Dashboard's "Do this first" list.
--
-- PRACTICE MODE: lead_alerts.live and morning_email.live start false. While false,
-- every message is written to cds_outbox with status 'practice' (Caregiver Match >
-- Messages shows them) and NOTHING is sent. Only the office is ever messaged; no
-- lead, family or caregiver is contacted by any of this.
--
-- Leads already on file when this first runs are marked as "before alerts", so
-- turning alerts on never sends about old leads.
--
-- Safe to run twice. The two schedules are added by the Desktop install script,
-- because they carry the job secret, which never goes in git.

-- ---------- site_leads: what was sent about each lead ----------
alter table public.site_leads add column if not exists alert_at timestamptz;        -- first alert handled (claimed before sending)
alter table public.site_leads add column if not exists alert_texted_at timestamptz; -- text handled (may wait for text hours)
alter table public.site_leads add column if not exists reminder_at timestamptz;     -- 30-minute reminder handled
alter table public.site_leads add column if not exists alert_failed text;           -- what did not send, shown on the Dashboard

-- The public form cannot set any of these.
create or replace function public.site_leads_alert_lock()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'anon' then
    new.alert_at := null; new.alert_texted_at := null; new.reminder_at := null; new.alert_failed := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.site_leads_alert_lock() from public, anon, authenticated;
drop trigger if exists site_leads_alert_lock_trg on public.site_leads;
create trigger site_leads_alert_lock_trg before insert on public.site_leads
  for each row execute function public.site_leads_alert_lock();

-- ---------- the outbox records office alerts about a lead ----------
alter table public.cds_outbox add column if not exists site_lead_id uuid references public.site_leads(id) on delete set null;
alter table public.cds_outbox drop constraint if exists cds_outbox_audience_check;
alter table public.cds_outbox add constraint cds_outbox_audience_check check (audience in ('caregiver','family','office'));

-- ---------- settings (practice until Samantha switches them on) ----------
-- First run only: mark every lead already on file as handled, so nothing old is sent.
do $$
begin
  if not exists (select 1 from public.cds_match_settings where key = 'lead_alerts') then
    update public.site_leads
       set alert_at = coalesce(alert_at, now()), alert_texted_at = coalesce(alert_texted_at, now()),
           reminder_at = coalesce(reminder_at, now())
     where alert_at is null;
    insert into public.cds_match_settings (key, value, updated_by) values ('lead_alerts', jsonb_build_object(
      'live', false,
      'recipients', jsonb_build_array(
        jsonb_build_object('name', 'Samantha', 'email', 'samantha@mo-care.com', 'phone', null),
        jsonb_build_object('name', 'Krystal',  'email', 'krystal@mo-care.com',  'phone', null)),
      'text_days', jsonb_build_array(1, 2, 3, 4, 5),
      'text_from', 8, 'text_until', 18,
      'reminder_minutes', 30,
      'started_at', now()), 'cds_lead_alerts.sql');
  end if;
end $$;

insert into public.cds_match_settings (key, value, updated_by) values ('morning_email', jsonb_build_object(
  'live', false,
  'emails', jsonb_build_array('samantha@mo-care.com', 'krystal@mo-care.com'),
  'hour', 8,
  'last_sent', null), 'cds_lead_alerts.sql')
on conflict (key) do nothing;

-- The schedules need these two.
create extension if not exists pg_cron;
create extension if not exists pg_net;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- select cron.unschedule('cds-lead-alert'); select cron.unschedule('cds-morning-cdt'); select cron.unschedule('cds-morning-cst');
-- delete from public.cds_match_settings where key in ('lead_alerts','morning_email');
-- drop trigger if exists site_leads_alert_lock_trg on public.site_leads;
-- alter table public.cds_outbox drop column if exists site_lead_id;
-- alter table public.site_leads drop column if exists alert_at, drop column if exists alert_texted_at,
--   drop column if exists reminder_at, drop column if exists alert_failed;
