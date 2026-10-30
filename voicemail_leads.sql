-- Voicemail leads (2026-10-29, Samantha: "build the voicemail lead text in practice with that wording,
-- Samantha and Zach only"). Her case: (719) 308-1546 left a voicemail at 11:33am that was clearly a lead,
-- and nothing read it or told anyone.
--
-- 1. Voicemails get a call note too (cds_call_notes, read by the cds-comms server function), not only
--    answered calls. voicemail = true on those rows.
-- 2. When the note says a new person is asking about CDS (new_lead), the cds-lead-alert job texts the
--    people in setting voicemail_leads.emails (their phones come from lead_alerts.recipients, never from
--    this file: the repo is public). Weekdays 9am to 4pm Central; otherwise at 9am the next weekday.
--    Not if someone already called them back. lead_texted_at marks it done (practice too).
-- 3. Each text carries a private link (cds_lead_links, now for a voicemail too: comm_id) to hear it and
--    call back. Only the link's fingerprint is kept; 7 days.
-- Practice until voicemail_leads.live is true: the texts are written to cds_outbox as practice.
-- Safe to run again.

alter table public.cds_call_notes add column if not exists voicemail boolean not null default false;
alter table public.cds_call_notes add column if not exists new_lead boolean not null default false;
alter table public.cds_call_notes add column if not exists lead_texted_at timestamptz;
alter table public.cds_call_notes add column if not exists lead_text_skipped text;
alter table public.cds_call_notes add column if not exists lead_alert_failed text;
create index if not exists cds_call_notes_new_lead on public.cds_call_notes (made_at) where new_lead and lead_texted_at is null;

alter table public.cds_lead_links alter column site_lead_id drop not null;
alter table public.cds_lead_links add column if not exists comm_id text references public.cds_comms(id) on delete cascade;
alter table public.cds_lead_links drop constraint if exists cds_lead_links_one_thing;
alter table public.cds_lead_links add constraint cds_lead_links_one_thing check ((site_lead_id is null) <> (comm_id is null));

-- since: today's 11:33am voicemail (16:33 UTC) is read once as the catch-up she asked for.
-- min_seconds: GoHighLevel's voicemail length includes the greeting, so a hang-up at the beep is under this.
insert into public.cds_match_settings (key, value, updated_by)
values ('voicemail_leads', jsonb_build_object('live', false, 'since', '2026-10-29T16:00:00Z', 'min_seconds', 25,
        'emails', jsonb_build_array('samantha@mo-care.com', 'zach@caringcds.com')), 'voicemail_leads.sql')
on conflict (key) do nothing;

notify pgrst, 'reload schema';

-- ---------- rollback (by hand, only if asked) ----------
-- delete from public.cds_match_settings where key = 'voicemail_leads';
-- delete from public.cds_lead_links where comm_id is not null;
-- alter table public.cds_lead_links drop constraint if exists cds_lead_links_one_thing;
-- alter table public.cds_lead_links drop column if exists comm_id;
-- alter table public.cds_lead_links alter column site_lead_id set not null;
