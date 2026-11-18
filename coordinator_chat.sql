-- The CDS Coordinator texts new website leads (2026-11-17, her "Yes, build it" on mockup HFQXH7oXcrZ55VtVUGsdrW v2). Server only.
create table if not exists public.cds_lead_chats (
  id            bigserial primary key,
  site_lead_id  text not null unique,                 -- site_leads.id as text
  lead_id       text not null,                       -- the hub lead: 'web-' || site_lead_id
  phone         text not null,                       -- 10 digits; the hub sees the last 4
  name          text,
  status        text not null check (status in ('new','asking','waiting','ready','followup','handoff','stopped','done')),
  answers       jsonb not null default '{}'::jsonb,
  followup      date,
  note          text,
  last_seen_at  timestamptz not null default now(),
  last_in_at    timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.cds_lead_chats enable row level security;
revoke all on public.cds_lead_chats from anon, authenticated;
revoke all on sequence public.cds_lead_chats_id_seq from anon, authenticated;
alter table public.cds_coord_msgs drop constraint if exists cds_coord_msgs_kind_check;
alter table public.cds_coord_msgs add constraint cds_coord_msgs_kind_check check (kind in ('clock','dsds','check','chat'));
-- Practice: every text waits on the lead for a person to press Send. Only website leads from now on.
-- Her word 11-17: no set call times; it says we'll call the consumer and gets their phone, name and date of birth.
update public.cds_match_settings set value = value || jsonb_build_object('lead_chat', coalesce(value->>'lead_chat', 'practice'),
  'lead_chat_from', coalesce(value->>'lead_chat_from', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))) where key = 'coordinator';
notify pgrst, 'reload schema';
